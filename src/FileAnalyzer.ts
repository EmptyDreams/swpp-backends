import {Buffer} from 'buffer'
import * as crypto from 'crypto'
import HTMLParser from 'fast-html-parser'
import fs from 'fs'
import {Request} from 'node-fetch'
import nodePath from 'path'
import {FileFetchModeLevel} from './SwppConfig'
import {deepFreeze, error, fetchFile, readEjectData, warn} from './Utils'
import {readEvent, readOldVersionJson, readRules, readVariant, writeVariant} from './Variant'

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
    const key = 'newVersionJson'
    if (readVariant(key)) {
        error('VersionJsonBuilder', '已经构建过一次版本文件')
        throw '重复构建版本文件'
    }
    const rules = readRules()
    const config = rules.config
    const list: VersionMap = {}
    const cacheInfoMap: Map<string, any> = readEvent('submitCacheInfo')
    const urlList: Set<string> = readEvent('submitExternalUrl')
    writeVariant('submitCacheInfo', false)
    writeVariant('submitExternalUrl', false)
    // 遍历所有文件
    await eachAllFile(root, async path => {
        const endIndex = path.length - (/[\/\\]index\.html$/.test(path) ? 10 : 0)
        const url = new URL(protocol + nodePath.join(domain, path.substring(root.length, endIndex)))
        const pathname = url.pathname
        if (isExclude(domain, pathname)) return
        let content = null
        if (findCache(url)) {
            // 对于需要缓存的文件计算 MD5 值并存储
            content = fs.readFileSync(path, 'utf-8')
            const key = decodeURIComponent(url.pathname)
            list[key] = crypto.createHash('md5').update(content).digest('hex')
        }
        if (!config.external) return
        // 分析外部文件
        const handler = findFileHandler(pathname)
        if (handler) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await handler.handle(domain, url.href, content, list)
        }
    })
    if (config.external) {
        // 分析规则文件中通过 extraListenedUrls 导入的 URL
        if ('extraListenedUrls' in rules) {
            const urls = rules.extraListenedUrls
            if (typeof urls.forEach !== 'function') {
                error('VersionJsonBuilder', `规则文件中的 extraListenedUrls 缺少 forEach 函数`)
                throw 'extraListenedUrls 类型错误'
            }
            urls.forEach((it: any) => {
                if (typeof it !== 'string') {
                    error('VersionJsonBuilder', 'extraListenedUrls 中应当存储 string 类型的值')
                    throw 'extraListenedUrls 元素类型错误'
                }
                urlList!.add(it)
            })
        }
        // 处理通过 API 提交的 URL
        for (let url of urlList!) {
            await eachAllLinkInUrl(domain, url, list)
        }
    }
    const external: any = {}
    cacheInfoMap.forEach((value, key) => {
        external[key] = value
    })
    if ('update' in rules) {
        external.swppFlag = rules.update.flag
    }
    return writeVariant('newVersionJson', deepFreeze({
        version: 3,
        list, external
    }))
}

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
 * + getter {string} 为 URL 对应文件的 md5 值
 * + getter {string[]} 为 stable 文件其中包含的 URL
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
export async function loadVersionJson(
    url: string, level: FileFetchModeLevel = FileFetchModeLevel.NORMAL
): Promise<VersionJson | null> {
    const key = 'oldVersionJson'
    const response = await fetchFile(url).catch(err => err)
    switch (true) {
        case response.status == 404 && level >= FileFetchModeLevel.NORMAL:
        case response.code == 'ENOTFOUND' && level == FileFetchModeLevel.LOOSE:
            warn('VersionJsonLoader', `拉取 ${url} 时出现 404 错误，如果您是第一次构建请忽略这个警告。`)
            return writeVariant(key, null)
        default:
            error('VersionJsonLoader', `拉取 ${url} 时出现 ${response.status} 错误！`)
            if ('status' in response)
                throw `拉取时出现 ${response.status} 异常`
            throw response
        case [200, 301, 302, 307, 308].includes(response.status):
            return writeVariant(key, await response.json()) as VersionJson
    }
}

/** 提交要存储到 version json 的值 */
export function submitCacheInfo(key: string, value: any) {
    const cacheInfoMap: Map<string, any> = readEvent('submitCacheInfo')
    cacheInfoMap.set(key, value)
}

/** 添加一个要监听的 URL */
export function submitExternalUrl(url: string) {
    readEvent<Set<string>>('submitExternalUrl').add(url)
}

writeVariant('submitCacheInfo', new Map<string, any>())
writeVariant('submitExternalUrl', new Set<string>())
writeVariant('registryFileHandler', [])

readVariant('registryFileHandler').push(...[
    {
        match: (url: string) => /(\/|\.html)$/.test(url),
        handle: eachAllLinkInHtml
    },
    {
        match: (url: string) => url.endsWith('.css'),
        handle: eachAllLinkInCss
    },
    {
        match: (url: string) => url.endsWith('.js'),
        handle: eachAllLinkInJavaScript
    }
])

/** 注册一个文件处理器 */
export function registryFileHandler(handler: FileHandler) {
    // noinspection JSMismatchedCollectionQueryUpdate
    readEvent<FileHandler[]>('registryFileHandler').push(handler)
}

/** 查询一个文件处理器 */
export function findFileHandler(url: string): FileHandler | undefined {
    return readEvent<FileHandler[]>('registryFileHandler').find(it => it.match(url))
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
        error('HtmlParser', `HTML [${url}] 中存在错误语法`)
    }
    if (html)
        each(html)
    return Promise.all(taskList)
}

async function eachAllLinkInCss(
    host: string, url: string, content: string, result: VersionMap, event?: (url: string) => void
): Promise<void[]> {
    const root = url.substring(0, url.lastIndexOf('/'))
    const urls = new Set<string>()
    /** 从指定位置开始查询注释 */
    const findComment = (tag: string, start: number) => {
        for (let i = start; i < content.length;) {
            const item = content[i]
            switch (item) {
                case tag[0]:
                    if (content[i + 1] === tag[1])
                        return i
                    ++i
                    break
                case '"': case '\'':
                    while (true) {
                        const index = content.indexOf(item, i + 1)
                        if (index < 0) return -1
                        i = index + 1
                        if (content[index - 1] !== '\\')
                            break
                    }
                    break
                default:
                    ++i
                    break
            }
        }
        return -1
    }
    for (let i = 0; i < content.length; ) {
        const left = findComment('/*', i)
        let sub
        if (left === -1) {
            sub = content.substring(i)
            i = Number.MAX_VALUE
        } else {
            sub = content.substring(i, left)
            const right = findComment('*/', left + 2)
            if (right === -1) i = Number.MAX_VALUE
            else i = right + 2
        }
        sub.match(/(url\(.*?\))|(@import\s+['"].*?['"])|((https?:)?\/\/[^\s/$.?#].\S*)/g)
            ?.map(it => it.replace(/(^url\(\s*(['"]?))|((['"]?\s*)\)$)|(^@import\s+['"])|(['"]$)/g, ''))
            ?.map(it => {
                switch (true) {
                    case it.startsWith('http'):
                        return it
                    case it.startsWith('//'):
                        return 'http' + it
                    case it.startsWith('/'):
                        return root + it
                    case it.startsWith('./'):
                        return root + it.substring(1)
                    default:
                        return root + '/' + it
                }
            })?.forEach(it => urls.add(it))
    }
    return Promise.all(
        Array.from(urls).map(it => eachAllLinkInUrl(host, it, result, event))
    )
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
    const calcRegLength = (item: string) => {
        let length = item.length
        for (let i = 0; i < item.length; ++i) {
            if (item[i] === '\\') {
                ++i
                --length
            }
        }
        return length
    }
    for (let value of ruleList) {
        if (typeof value === 'function') {
            const urls: string[] = value(content)
            for (let url of urls) {
                taskList.push(eachAllLinkInUrl(domain, url, result, event))
            }
        } else {
            const {head, tail} = value
            const headLength = calcRegLength(head)
            const tailLength = calcRegLength(tail)
            const reg = new RegExp(`${head}(['"\`])(.*?)(['"\`])${tail}`, 'mg')
            const list = content.match(reg)
                ?.map(it => it.substring(headLength, it.length - tailLength).trim())
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