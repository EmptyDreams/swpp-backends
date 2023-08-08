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
        await Promise.all(
            files.map(it => eachAllFile(nodePath.join(root, it), cb))
        )
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
    if (response?.status === 404 || response?.code === 'ENOTFOUND') {
        warn('LoadVersionJson', `拉取 ${url} 时出现 404 错误，如果您是第一次构建请忽略这个警告。`)
        return _oldVersionJson = null
    } else {
        return _oldVersionJson = (await response.json()) as VersionJson
    }
}

let _oldVersionJson: VersionJson | null | undefined = undefined
let _newVersionJson: VersionJson
let _mergeVersionMap: VersionMap

let cacheInfoMap: Map<string, any> | null = new Map<string, any>()
let urlList: Set<string> | null = new Set<string>()

/** 提交要存储到 version json 的值 */
export function submitCacheInfo(key: string, value: any) {
    if (!cacheInfoMap) {
        error('SubmitCacheInfo', 'version json 已经完成构建，调用该函数无意义！')
        throw 'submitCacheInfo 调用时机错误'
    }
    cacheInfoMap.set(key, value)
}

/** 添加一个要监听的 URL */
export function submitExternalUrl(url: string) {
    if (!urlList) {
        error('SubmitExternalUrl', 'version json 已经完成构建，调用该函数无意义！')
        throw 'submitExternalUrl 调用时机错误'
    }
    urlList.add(url)
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
        const handler = findFileHandler(pathname)
        if (handler) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await handler.handle(domain, url.href, content, list)
        }
    })
    for (let url of urlList!) {
        await eachAllLinkInUrl(domain, url, list)
    }
    const external: any = {}
    cacheInfoMap!.forEach((value, key) => {
        external[key] = value
    })
    urlList = cacheInfoMap = null
    return _newVersionJson = {
        version: 3, list, external
    }
}

const fileHandlers: FileHandler[] = [
    {
        match: url => /(\/|\.html)$/.test(url),
        handle: eachAllLinkInHtml
    },
    {
        match: url => url.endsWith('.css'),
        handle: eachAllLinkInCss
    },
    {
        match: url => url.endsWith('.js'),
        handle: eachAllLinkInJavaScript
    }
]

/** 注册一个文件处理器 */
export function registryFileHandler(handler: FileHandler) {
    if (!urlList) {
        error('RegistryFileHandler', '文件已经扫描完毕，调用该函数无意义！')
        throw 'registryFileHandler 调用时机错误'
    }
    fileHandlers.push(handler)
}

/** 查询一个文件处理器 */
export function findFileHandler(url: string): FileHandler | undefined {
    return fileHandlers.find(it => it.match(url))
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
            event?.(url)
            return
        }
    }
    const handler = findFileHandler(new URL(url).pathname)
    if (!handler && stable) {
        result[url] = []
        return
    }
    result[url] = false
    const response = await fetchFile(url).catch(err => err)
    if (![200, 301, 302, 307, 308].includes(response?.status ?? 0)) {
        error('LinkItorInUrl', `拉取文件 [${url}] 时出现错误：${response?.status ?? response?.code}`)
        return
    }
    event?.(url)
    if (handler) {
        const content = await response.text()
        if (stable) result[url] = []
        else result[url] = crypto.createHash('md5').update(content).digest('hex')
        await handler.handle(domain, url, content, result, stable ? it => result[url].push(it) : undefined)
    } else {
        const buffer = Buffer.from(await response.arrayBuffer())
        result[url] = crypto.createHash('md5').update(buffer).digest('hex')
    }
}

async function eachAllLinkInHtml(
    domain: string, url: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const root = url.substring(0, url.lastIndexOf('/') + 1)
    const taskList: Promise<any>[] = []
    const each = (node: HTMLParser.HTMLElement) => {
        let subUrl: string | undefined = undefined
        switch (node.tagName) {
            case 'link':
                // noinspection SpellCheckingInspection
                if (node.attributes.rel !== 'preconnect')
                    subUrl = node.attributes.href
                break
            case 'script': case 'img': case 'source': case 'iframe': case 'embed':
                subUrl = node.attributes.src
                break
            case 'object':
                subUrl = node.attributes.data
                break
        }
        if (subUrl) {
            taskList.push(eachAllLinkInUrl(domain, subUrl, result, event))
        } else if (node.tagName === 'script') {
            taskList.push(eachAllLinkInJavaScript(domain, url, node.rawText, result, event))
        } else if (node.tagName === 'style') {
            taskList.push(eachAllLinkInCss(domain, url, node.rawText, result, event))
        }
        if (node.childNodes) {
            for (let childNode of node.childNodes) {
                each(childNode)
            }
        }
    }
    let html
    try {
        html = HTMLParser.parse(content, { style: true, script: true })
    } catch (e) {
        error('HtmlParser', `HTML [root=${url}] 中存在错误语法`)
    }
    if (html)
        each(html)
    return Promise.all(taskList)
}

async function eachAllLinkInCss(
    domain: string, url: string, content: string, result: VersionMap, event?: (url: string) => void
): Promise<void[]> {
    const root = url.substring(0, url.lastIndexOf('/') + 1)
    const taskList: Promise<any>[] = []
    const each = (any: Array<any> | undefined) => {
        if (!any) return
        for (let rule of any) {
            if (rule.declarations)
                each(rule.declarations)
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
                            taskList.push(eachAllLinkInUrl(domain, url, result, event))
                        }
                    }
                    break
                case 'import':
                    const url = rule.import.trim().replace(/^["']|["']$/g, '')
                    taskList.push(eachAllLinkInUrl(domain, url, result, event))
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
        each(css)
    return Promise.all(taskList)
}

function eachAllLinkInJavaScript(
    domain: string, _: string, content: string, result: VersionMap, event?: (url: string) => void
) {
    const taskList: Promise<any>[] = []
    const ruleList = readRules().config?.external?.js
    if (!ruleList) {
        error('LinkItorInJS', '不应发生的异常')
        throw 'ruleList 为空'
    }
    for (let value of ruleList) {
        if (typeof value === 'function') {
            const urls: string[] = value(content)
            for (let url of urls) {
                taskList.push(eachAllLinkInUrl(domain, url, result, event))
            }
        } else {
            const {head, tail} = value
            const reg = new RegExp(`${head}(['"\`])(.*?)(['"\`])${tail}`, 'mg')
            const list = content.match(reg)
                ?.map(it => it.substring(head.length, it.length - tail.length).trim())
                ?.map(it => it.replace(/^['"`]|['"`]$/g, ''))
            if (list) {
                for (let url of list) {
                    taskList.push(eachAllLinkInUrl(domain, url, result, event))
                }
            }
        }
    }
    return Promise.all(taskList)
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

export interface FileHandler {
    match: (url: string) => boolean,
    handle: (domain: string, url: string, content: string, result: VersionMap, event?: (url: string) => void) => Promise<any>
}