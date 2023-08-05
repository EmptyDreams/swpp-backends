import fs from 'fs'
import nodePath from 'path'
import {Request} from 'node-fetch'
import {readRules} from './SwppRules'
import * as crypto from 'crypto'
import {Buffer} from 'buffer'
import HTMLParser from 'fast-html-parser'
import CSSParser from 'css'
import {error, fetchFile, readEjectData, warn} from './Utils'

/**
 * 版本信息（可以用 JSON 序列化）
 * @see VersionMap
 */
export interface VersionJson {
    version: number,
    list: VersionMap,
    external: {
        [propName: string]: any
    }
}

/**
 * 版本列表
 *
 * + key 为文件的 URL
 * + value {string} 为 URL 对应文件的 md5 值
 * + value {string[]} 为 stable 文件其中包含的 URL
 */
export interface VersionMap {
    [propName: string]: any
}

/**
 * 遍历指定目录及其子目录中包含的所有文件（不遍历文件夹）
 * @param root 根目录
 * @param cb 回调函数（接收的参数是文件的相对路径）
 */
async function eachAllFile(root: string, cb: (path: string) => Promise<void>) {
    const stats = fs.statSync(root)
    if (stats.isFile()) await cb(root)
    else {
        const files = fs.readdirSync(root)
        for (let it of files) {
            await eachAllFile(nodePath.join(root, it), cb)
        }
    }
}

/**
 * 判断指定 URL 是否排除
 *
 * + **执行该函数前必须调用过 [loadRules]**
 *
 * @param domain 网站域名
 * @param url 要判断的 URL
 */
export function isExclude(domain: string, url: string): boolean {
    const exclude = readRules().config?.json?.exclude
    if (!exclude) return false
    const list = isExternalLink(domain, url) ? exclude.other : exclude.localhost
    for (let reg of list) {
        if (url.match(reg)) return true
    }
    return false
}

/**
 * 判断指定 URL 是否是 stable 的
 *
 * + **执行该函数前必须调用过 [loadRules]**
 */
export function isStable(url: string): boolean {
    const stable = readRules().config?.external?.stable
    if (!stable) return false
    for (let reg of stable) {
        if (url.match(reg)) return true
    }
    return false
}

/**
 * 从指定 URL 加载 version json
 *
 * + **执行该函数前必须调用过 [loadRules]**
 */
export async function loadVersionJson(url: string): Promise<VersionJson | null> {
    const response = await fetchFile(url).catch(err => err)
    if (response?.status === 404) {
        warn('LoadVersionJson', `拉取 ${url} 时出现 404 错误，如果您是第一次构建请忽略这个警告。`)
        return _oldVersionJson = null
    } else {
        return _oldVersionJson = (await response.json()) as VersionJson
    }
}

let _oldVersionJson: VersionJson | null | undefined = undefined
let _newVersionJson: VersionJson
let _mergeVersionMap: VersionMap

const event = new Map<string, any>()

/** 提交要存储到 version json 的值 */
export function submitCacheInfo(key: string, value: any) {
    event.set(key, value)
}

/**
 * 读取最后一次加载的 version json
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 */
export function readOldVersionJson(): VersionJson | null {
    if (_oldVersionJson === undefined) {
        error('OldVersionReader', 'version json 尚未初始化')
        throw 'version json 尚未初始化'
    }
    return _oldVersionJson
}

/**
 * 读取最后一次构建的 VersionJson
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function readNewVersionJson(): VersionJson {
    if (!_newVersionJson) {
        error('NewVersionReader', 'version json 尚未初始化')
        throw 'version json 尚未初始化'
    }
    return _newVersionJson
}

/**
 * 读取新旧版本文件合并后的版本地图
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function readMergeVersionMap(): VersionMap {
    if (_mergeVersionMap) return _mergeVersionMap
    const map: VersionMap = {}
    Object.assign(map, readOldVersionJson()?.list ?? {})
    Object.assign(map, readNewVersionJson().list)
    return _mergeVersionMap = map
}

/**
 * 构建一个 version json
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 *
 * @param protocol 网站的网络协议
 * @param domain 网站域名（包括二级域名）
 * @param root 网页根目录（首页 index.html 所在目录）
 */
export async function buildVersionJson(
    protocol: ('https://' | 'http://'), domain: string, root: string
): Promise<VersionJson> {
    const list: VersionMap = {}
    await eachAllFile(root, async path => {
        const endIndex = path.length - (/[\/\\]index\.html$/.test(path) ? 10 : 0)
        const url = new URL(protocol + nodePath.join(domain, path.substring(root.length, endIndex)))
        const pathname = url.pathname
        if (isExclude(domain, pathname)) return
        let content = null
        if (findCache(url)) {
            content = fs.readFileSync(path, 'utf-8')
            const key = decodeURIComponent(url.pathname)
            list[key] = crypto.createHash('md5').update(content).digest('hex')
        }
        if (pathname.endsWith('/') || pathname.endsWith('.html')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInHtml(domain, protocol + domain, content, list)
        } else if (pathname.endsWith('.css')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInCss(domain, protocol + domain, content, list)
        } else if (pathname.endsWith('.js')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInJavaScript(domain, content, list)
        }
    })
    const external: any = {}
    event.forEach((value, key) => {
        external[key] = value
    })
    return _newVersionJson = {
        version: 3, list, external
    }
}

/**
 * 检索一个 URL 指向的文件中所有地外部链接
 *
 * 该函数会处理该 URL 指向的文件和文件中直接或间接包含的所有 URL
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 *
 * @param domain 网站域名
 * @param url 要检索的 URL
 * @param result 存放结果的对象
 * @param event 检索到一个 URL 时触发的事件
 */
export async function eachAllLinkInUrl(
    domain: string, url: string, result: VersionMap, event?: (url: string) => void
) {
    if (url.startsWith('//')) url = 'http:' + url
    if (url in result) return event?.(url)
    if (!url.startsWith('http') || isExclude(domain, url)) return
    if (!(isExternalLink(domain, url) && findCache(new URL(url)))) return
    event?.(url)
    const stable = isStable(url)
    if (stable) {
        const old = readOldVersionJson()?.list
        if (Array.isArray(old?.[url])) {
            const copyTree = (key: string) => {
                const value = old![key]
                if (!value) return
                result[key] = value
                if (Array.isArray(value)) {
                    result[key] = value
                    for (let url of value) {
                        copyTree(url)
                    }
                }
            }
            copyTree(url)
            return
        }
    }
    const response = await fetchFile(url).catch(err => err)
    if (![200, 301, 302, 307, 308].includes(response?.status ?? 0)) {
        error('LinkItorInUrl', `拉取文件 [${url}] 时出现错误：${response?.status}`)
        return
    }
    const pathname = new URL(url).pathname
    let content: string
    const nextEvent = (it: string) => {
        if (stable)
            result[url].push(it)
    }
    const update = () => {
        if (stable) result[url] = []
        else result[url] = crypto.createHash('md5').update(content).digest('hex')
    }
    switch (true) {
        case pathname.endsWith('.html'): case pathname.endsWith('/'):
            content = await response.text()
            update()
            await eachAllLinkInHtml(domain, url.substring(0, url.lastIndexOf('/') + 1), content, result, nextEvent)
            break
        case pathname.endsWith('.css'):
            content = await response.text()
            update()
            await eachAllLinkInCss(domain, url.substring(0, url.lastIndexOf('/') + 1), content, result, nextEvent)
            break
        case pathname.endsWith('.js'):
            content = await response.text()
            update()
            await eachAllLinkInJavaScript(domain, content, result, nextEvent)
            break
        default:
            if (stable) {
                result[url] = []
            } else {
                const buffer = Buffer.from(await response.arrayBuffer())
                result[url] = crypto.createHash('md5').update(buffer).digest('hex')
            }
            break
    }
}

/**
 * 检索 HTML 文件中的所有外部链接
 *
 * 该函数仅处理 HTML 当中直接或间接包含的 URL，不处理文件本身
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param domain 网站域名
 * @param root 当前资源的根
 * @param content HTML 文件内容
 * @param result 存放结果的对象
 * @param event 检索到 URL 时触发的事件
 */
export async function eachAllLinkInHtml(
    domain: string, root: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const each = async (node: HTMLParser.HTMLElement) => {
        let url: string | undefined = undefined
        switch (node.tagName) {
            case 'link':
                // noinspection SpellCheckingInspection
                if (node.attributes.rel !== 'preconnect')
                    url = node.attributes.href
                break
            case 'script': case 'img': case 'source': case 'iframe': case 'embed':
                url = node.attributes.src
                break
            case 'object':
                url = node.attributes.data
                break
        }
        if (url) {
            await eachAllLinkInUrl(domain, url, result, event)
        } else if (node.tagName === 'script') {
            await eachAllLinkInJavaScript(domain, node.rawText, result, event)
        } else if (node.tagName === 'style') {
            await eachAllLinkInCss(domain, root, node.rawText, result, event)
        }
        if (node.childNodes) {
            for (let childNode of node.childNodes) {
                await each(childNode)
            }
        }
    }
    let html
    try {
        html = HTMLParser.parse(content, { style: true, script: true })
    } catch (e) {
        error('HtmlParser', `HTML [root=${root}] 中存在错误语法`)
    }
    if (html)
        await each(html)
}

/**
 * 检索 CSS 文件中的所有外部链
 *
 * 该函数仅处理 CSS 当中直接或间接包含的 URL，不处理文件本身
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param domain 网站域名
 * @param root 当前资源的 URL 的根
 * @param content CSS 文件内容
 * @param result 存放结果的对象
 * @param event 当检索到一个 URL 后触发的事件
 */
export async function eachAllLinkInCss(
    domain: string, root: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const each = async (any: Array<any> | undefined) => {
        if (!any) return
        for (let rule of any) {
            if (rule.declarations)
                await each(rule.declarations)
            switch (rule.type) {
                case 'declaration':
                    const value: string = rule.value
                    const list = value.match(/url\(['"]?([^'")]+)['"]?\)/g)
                        ?.map(it => it.replace(/(^url\(['"]?)|(['"]?\)$)/g, ''))
                    if (list) {
                        for (let url of list) {
                            if (!/^(https?:)|(\/\/)/.test(url)) {
                                if (url[0] === '/') url = root + url.substring(1)
                                else url = root + url
                            }
                            await eachAllLinkInUrl(domain, url, result, event)
                        }
                    }
                    break
                case 'import':
                    const url = rule.import.trim().replace(/^["']|["']$/g, '')
                    await eachAllLinkInUrl(domain, url, result, event)
                    break
            }
        }
    }
    let css
    try {
        css = CSSParser.parse(content).stylesheet?.rules
    } catch (e) {
        error('CssParser', `CSS [root=${root}] 中存在错误语法`)
    }
    if (css)
        await each(css)
}

/**
 * 遍历 JS 文件中地所有外部链接
 *
 * 该函数仅处理 JS 当中直接或间接包含的 URL，不处理文件本身
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param domain 网站域名
 * @param content JS 文件内容
 * @param result 存放结果的对象
 * @param event 当检索到一个 URL 后触发的事件
 */
export async function eachAllLinkInJavaScript(
    domain: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const ruleList = readRules().config?.external?.js
    if (!ruleList) {
        error('LinkItorInJS', '不应发生的异常')
        throw 'ruleList 为空'
    }
    for (let value of ruleList) {
        if (typeof value === 'function') {
            const urls: string[] = value(content)
            for (let url of urls) {
                await eachAllLinkInUrl(domain, url, result, event)
            }
        } else {
            const {head, tail} = value
            const reg = new RegExp(`${head}(['"\`])(.*?)(['"\`])${tail}`, 'mg')
            const list = content.match(reg)
                ?.map(it => it.substring(head.length, it.length - tail.length).trim())
                ?.map(it => it.replace(/^['"`]|['"`]$/g, ''))
            if (list) {
                for (let url of list) {
                    await eachAllLinkInUrl(domain, url, result, event)
                }
            }
        }
    }
}

/** 判断一个 URL 是否是外部链接 */
function isExternalLink(domain: string, url: string): boolean {
    if (url[0] === '/' && url[1] !== '/') return false
    return !new RegExp(`^(https?:)?\\/\\/${domain}`).test(url)
}

/**
 * 查询指定 URL 对应的缓存规则
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function findCache(url: URL | string): any | null {
    const {cacheRules} = readRules()
    const eject = readEjectData()
    if (typeof url === 'string') url = new URL(url)
    url = new URL(replaceRequest(url.href))
    for (let key in cacheRules) {
        const value = cacheRules[key]
        if (value.match(url, eject?.nodeEject)) return value
    }
    return null
}

/**
 * 替换请求
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function replaceRequest(url: string): string {
    const rules = readRules()
    if (!('modifyRequest' in rules)) return url
    const {modifyRequest} = rules
    const request = new Request(url)
    return modifyRequest?.(request, readEjectData()?.nodeEject)?.url ?? url
}