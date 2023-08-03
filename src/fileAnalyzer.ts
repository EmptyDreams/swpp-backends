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

export interface CacheJson {
    version: number
}

/**
 * 遍历指定目录下的所有文件
 * @param root 根目录
 * @param cb 回调函数
 */
function eachAllFile(root: string, cb: (path: string) => void) {
    const stats = fs.statSync(root)
    if (stats.isFile()) cb(root)
    else {
        const files = fs.readdirSync(root)
        files.forEach(it => eachAllFile(nodePath.join(root, it), cb))
    }
}

/** 判断指定文件是否排除 */
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

let _oldCacheJson: CacheJson

/** 从指定 URL 加载 cache json */
export async function loadCacheJson(url: string): Promise<CacheJson> {
    const response = await fetchFile(url)
    return _oldCacheJson = (await response.json()) as CacheJson
}

/** 读取最后一次加载的 cache json */
export function readCacheJson(): CacheJson {
    return _oldCacheJson
}

/**
 * 构建一个 cache json
 * @param protocol 网站地网络协议
 * @param webRoot 网站根路径（不包括网络协议）
 * @param root 根目录
 */
export async function buildCacheJson(protocol: ('https://' | 'http://'), webRoot: string, root: string): Promise<CacheJson> {
    const result: any = {}
    eachAllFile(root, async path => {
        const endIndex = path.length - (path.endsWith('/index.html') ? 10 : 0)
        const url = new URL(protocol + nodePath.join(webRoot, path.substring(root.length, endIndex)))
        const pathname = url.pathname
        if (isExclude(webRoot, pathname)) return
        let content = null
        if (findCache(url)) {
            content = fs.readFileSync(path, 'utf-8')
            const key = decodeURIComponent(url.pathname)
            result[key] = crypto.createHash('md5').update(content).digest('hex')
        }
        const cacheJson: any = {
            version: 3
        }
        if (pathname.endsWith('/') || pathname.endsWith('.html')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInHtml(webRoot, content, result)
        } else if (pathname.endsWith('.css')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInCss(webRoot, content, result)
        } else if (pathname.endsWith('.js')) {
            if (!content) content = fs.readFileSync(path, 'utf-8')
            await eachAllLinkInJavaScript(webRoot, content, result)
        }
    })
    return result
}

/** 遍历一个 URL 指向地文件中所有地外部链接 */
export async function eachAllLinkInUrl(webRoot: string, url: string, result: any, event?: (url: string) => void) {
    if (url.startsWith('//')) url = 'http' + url
    if (url in result) return event?.(url)
    if (!url.startsWith('http') || isExclude(webRoot, url)) return
    if (!(isExternalLink(webRoot, url) && findCache(new URL(url)))) return
    event?.(url)
    const stable = isStable(url)
    if (stable) {
        const old = readCacheJson() as any
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

/** 遍历 HTML 文件中的所有外部链接 */
export async function eachAllLinkInHtml(webRoot: string, content: string, result: any, event?: (url: string) => void) {
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

/** 遍历 CSS 文件中的所有外部链接 */
export async function eachAllLinkInCss(webRoot: string, content: string, result: any, event?: (url: string) => void) {
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

/** 遍历 JS 文件中地所有外部链接 */
export async function eachAllLinkInJavaScript(webRoot: string, content: string, result: any, event?: (url: string) => void) {
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

/** 查询缓存规则 */
export function findCache(url: URL): string | null {
    const rules = readRules()
    const {cacheList} = rules
    const eject = readEjectData()
    url = new URL(replaceRequest(url.href, rules))
    for (let key in cacheList) {
        const value = cacheList[key]
        if (value.match(url, eject.nodeEject)) return value
    }
    return null
}

/** 替换请求 */
export function replaceRequest(url: string, rules: any): string {
    if (!('modifyRequest' in rules)) return url
    const {modifyRequest} = rules
    const request = new Request(url)
    return modifyRequest(request, readEjectData().nodeEject)?.url ?? url
}