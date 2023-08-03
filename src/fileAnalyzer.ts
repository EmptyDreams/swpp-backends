import fs from 'fs'
import nodePath from 'path'
import {Request} from 'node-fetch'
import {fetchFile} from './utils'
import * as crypto from 'crypto'
import {Buffer} from 'buffer'
import HTMLParser from 'fast-html-parser'
import CSSParser from 'css'
import {readEjectData} from './utils'
import {readRules} from './swppRules'

/**
 * 版本信息（可以用 JSON 序列化）
 * @see VersionMap
 */
export interface VersionJson {
    version: number,
    list: VersionMap
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
function eachAllFile(root: string, cb: (path: string) => void) {
    const stats = fs.statSync(root)
    if (stats.isFile()) cb(root)
    else {
        const files = fs.readdirSync(root)
        files.forEach(it => eachAllFile(nodePath.join(root, it), cb))
    }
}

/**
 * 判断指定 URL 是否排除
 * @param webRoot 网站域名
 * @param url 要判断的 URL
 */
export function isExclude(webRoot: string, url: string): boolean {
    const exclude = readRules().config.json.exclude
    const list = isExternalLink(webRoot, url) ? exclude.other : exclude.localhost
    for (let reg of list) {
        if (url.match(reg)) return true
    }
    return false
}

/** 判断指定 URL 是否是 stable 的 */
export function isStable(url: string): boolean {
    const stable = readRules().config.external.stable
    for (let reg of stable) {
        if (url.match(reg)) return true
    }
    return false
}

let _oldCacheJson: VersionJson

/** 从指定 URL 加载 cache json */
export async function loadCacheJson(url: string): Promise<VersionJson> {
    const response = await fetchFile(url)
    return _oldCacheJson = (await response.json()) as VersionJson
}

/**
 * 读取最后一次加载的 cache json
 *
 * **调用该函数前必须调用过 [loadCacheJson]**
 */
export function readCacheJson(): VersionJson {
    return _oldCacheJson
}

/**
 * 构建一个 cache json
 *
 * **执行该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param protocol 网站的网络协议
 * @param webRoot 网站域名（包括二级域名）
 * @param root 网页根目录（首页 index.html 所在目录）
 */
export async function buildCacheJson(
    protocol: ('https://' | 'http://'), webRoot: string, root: string
): Promise<VersionJson> {
    const list: VersionMap = {}
    eachAllFile(root, async path => {
        const endIndex = path.length - (path.endsWith('/index.html') ? 10 : 0)
        const url = new URL(protocol + nodePath.join(webRoot, path.substring(root.length, endIndex)))
        const pathname = url.pathname
        if (isExclude(webRoot, pathname)) return
        let content = null
        if (findCache(url)) {
            content = fs.readFileSync(path, 'utf-8')
            const key = decodeURIComponent(url.pathname)
            list[key] = crypto.createHash('md5').update(content).digest('hex')
        }
        if (pathname.endsWith('/') || pathname.endsWith('.html')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInHtml(webRoot, content, list)
        } else if (pathname.endsWith('.css')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInCss(webRoot, content, list)
        } else if (pathname.endsWith('.js')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInJavaScript(webRoot, content, list)
        }
    })
    return {
        version: 3, list
    }
}

/**
 * 检索一个 URL 指向的文件中所有地外部链接
 *
 * 该函数会处理该 URL 指向的文件和文件中直接或间接包含的所有 URL
 *
 * **执行该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param webRoot 网站域名
 * @param url 要检索的 URL
 * @param result 存放结果的对象
 * @param event 检索到一个 URL 时触发的事件
 */
export async function eachAllLinkInUrl(
    webRoot: string, url: string, result: VersionMap, event?: (url: string) => void
) {
    if (url.startsWith('//')) url = 'http' + url
    if (url in result) return event?.(url)
    if (!url.startsWith('http') || isExclude(webRoot, url)) return
    if (!(isExternalLink(webRoot, url) && findCache(new URL(url)))) return
    event?.(url)
    const stable = isStable(url)
    if (stable) {
        const old = readCacheJson().list
        if (url in old) {
            const copyTree = (key: string) => {
                const value = old[key]
                if (!value) return
                result[key] = value
                if (Array.isArray(value)) {
                    result[key] = value
                    for (let url of value) {
                        copyTree(url)
                    }
                } else {
                    event?.(value)
                }
            }
            copyTree(url)
            return
        }
    }
    const response = await fetchFile(url)
    if (![200, 301, 302, 307, 308].includes(response.status))
        throw response
    const pathname = new URL(url).pathname
    let content: string | undefined
    const relay: string[] = []
    const nextEvent = (it: string) => {
        relay.push(it)
        event?.(it)
    }
    switch (true) {
        case pathname.endsWith('.html'): case pathname.endsWith('/'):
            content = await response.text()
            await eachAllLinkInHtml(webRoot, content, result, nextEvent)
            break
        case pathname.endsWith('.css'):
            content = await response.text()
            await eachAllLinkInCss(webRoot, content, result, nextEvent)
            break
        case pathname.endsWith('.js'):
            content = await response.text()
            await eachAllLinkInJavaScript(webRoot, content, result, nextEvent)
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
    if (content) {
        if (stable) {
            result[url] = relay
        } else {
            result[url] = crypto.createHash('md5').update(content).digest('hex')
        }
    }
}

/**
 * 检索 HTML 文件中的所有外部链接
 *
 * 该函数仅处理 HTML 当中直接或间接包含的 URL，不处理文件本身
 *
 * **执行该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param webRoot 网站域名
 * @param content HTML 文件内容
 * @param result 存放结果的对象
 * @param event 检索到 URL 时触发的事件
 */
export async function eachAllLinkInHtml(
    webRoot: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const each = async (node: HTMLParser.HTMLElement) => {
        let url: string | undefined = undefined
        switch (node.tagName) {
            case 'link':
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
            await eachAllLinkInUrl(webRoot, url, result, event)
        } else if (node.tagName === 'script') {
            await eachAllLinkInJavaScript(webRoot, node.rawText, result, event)
        } else if (node.tagName === 'style') {
            await eachAllLinkInCss(webRoot, node.rawText, result, event)
        }
        for (let childNode of node.childNodes) {
            await each(childNode)
        }
    }
    await each(HTMLParser.parse(content, { style: true, script: true }))
}

/**
 * 检索 CSS 文件中的所有外部链
 *
 * 该函数仅处理 CSS 当中直接或间接包含的 URL，不处理文件本身
 *
 * **执行该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param webRoot 网站域名
 * @param content CSS 文件内容
 * @param result 存放结果的对象
 * @param event 当检索到一个 URL 后触发的事件
 */
export async function eachAllLinkInCss(
    webRoot: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const each = async (any: Array<any> | undefined) => {
        if (!any) return
        for (let rule of any) {
            switch (rule.type) {
                case 'rule':
                    await each(rule.declarations)
                    break
                case 'declaration':
                    const value: string = rule.value
                    const list = value.match(/url\(['"]?([^'")]+)['"]?\)/g)
                        ?.map(it => it.replace(/(^url\(['"])|(['"]\)$)/g, ''))
                    if (list) {
                        for (let url of list) {
                            await eachAllLinkInUrl(webRoot, url, result, event)
                        }
                    }
                    break
                case 'import':
                    const url = rule.import.trim().replace(/^["']|["']$/g, '')
                    await eachAllLinkInUrl(webRoot, url, result, event)
                    break
            }
        }
    }
    await each(CSSParser.parse(content).stylesheet?.rules)
}

/**
 * 遍历 JS 文件中地所有外部链接
 *
 * 该函数仅处理 JS 当中直接或间接包含的 URL，不处理文件本身
 *
 * **执行该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param webRoot 网站域名
 * @param content JS 文件内容
 * @param result 存放结果的对象
 * @param event 当检索到一个 URL 后触发的事件
 */
export async function eachAllLinkInJavaScript(
    webRoot: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const ruleList = readRules().config.external.js
    for (let value of ruleList) {
        if (typeof value === 'function') {
            const urls: string[] = value(content)
            for (let url of urls) {
                await eachAllLinkInUrl(webRoot, url, result, event)
            }
        } else {
            const {head, tail} = value
            const reg = new RegExp(`${head}(['"\`])(.*?)(['"\`])${tail}`, 'mg')
            const list = content.match(reg)
                ?.map(it => it.substring(head.length, it.length - tail.length).trim())
                ?.map(it => it.replace(/^['"`]|['"`]$/g, ''))
            if (list) {
                for (let url of list) {
                    await eachAllLinkInUrl(webRoot, url, result, event)
                }
            }
        }
    }
}

/** 判断一个 URL 是否是外部链接 */
function isExternalLink(webRoot: string, url: string): boolean {
    return new RegExp(`^(https?:)?\\/\\/${webRoot}`).test(url)
}

/**
 * 查询指定 URL 对应的缓存规则
 *
 * **执行该函数前必须调用过 [loadRules]**
 */
export function findCache(url: URL | string): any | null {
    const {cacheList} = readRules()
    const eject = readEjectData()
    if (typeof url === 'string') url = new URL(url)
    url = new URL(replaceRequest(url.href))
    for (let key in cacheList) {
        const value = cacheList[key]
        if (value.match(url, eject.nodeEject)) return value
    }
    return null
}

/**
 * 替换请求
 *
 * **执行该函数前必须调用过 [loadRules]**
 */
export function replaceRequest(url: string): string {
    const rules = readRules()
    if (!('modifyRequest' in rules)) return url
    const {modifyRequest} = rules
    const request = new Request(url)
    return modifyRequest(request, readEjectData().nodeEject)?.url ?? url
}