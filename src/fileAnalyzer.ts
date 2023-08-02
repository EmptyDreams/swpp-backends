import fs, {read} from "fs";
import nodePath from "path";
import {Request} from "node-fetch";
import {EjectData, fetchFile} from "./utils";
import * as crypto from "crypto";
import {Buffer} from "buffer";
import HTMLParser from 'fast-html-parser';
import CSSParser, {AtRule, Rule} from 'css'
import {readEjectData} from "./utils";

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
function isExclude(pathname: string, rules: any): boolean {
    const exclude = rules.config.json.exclude
    for (let reg of exclude) {
        if (pathname.match(reg)) return true
    }
    return false
}

/**
 * 构建一个 cache json
 * @param protocol 网站地网络协议
 * @param webRoot 网站根路径（不包括网络协议）
 * @param root 根目录
 * @param rules swpp 规则文件
 */
export function buildCacheJson(protocol: ('https://' | 'http://'), webRoot: string, root: string, rules: any): any {
    const result: FileMd5[] = []
    eachAllFile(root, path => {
        const endIndex = path.length - (path.endsWith('/index.html') ? 10 : 0)
        const url = new URL(protocol + nodePath.join(webRoot, path.substring(root.length, endIndex)))
        if (isExclude(url.pathname, rules)) return
        let content = null
        if (findCache(url, rules)) {
            content = fs.readFileSync(path, 'utf-8')
            const key = decodeURIComponent(url.pathname)
            result.push({
                url: key,
                md5: crypto.createHash('md5').update(content).digest('hex')
            })
        }

    })
}

const successStatus = [200, 301, 302, 307, 308]

/** 遍历一个 URL 指向地文件中所有地外部链接 */
export async function eachAllLinkInUrl(webRoot: string, url: string, rules: any): Promise<FileMd5[]> {
    if (url.startsWith('//')) url = 'http' + url
    if (!url.startsWith('http')) return []
    if (!(isExternalLink(webRoot, url) && findCache(new URL(url), rules))) return []
    const response = await fetchFile(rules.config, url)
    if (!successStatus.includes(response.status))
        throw response
    const result: FileMd5[] = []
    const pathname = new URL(url).pathname
    let content: any = null
    switch (true) {
        case pathname.endsWith('.html'): case pathname.endsWith('/'):
            content = await response.text()
            result.push(...await eachAllLinkInHtml(webRoot, content, rules))
            break
        case pathname.endsWith('.css'):
            content = await response.text()
            result.push(...await eachAllLinkInCss(webRoot, content, rules))
            break
        case pathname.endsWith('.js'):
            content = await response.text()
            result.push(...await eachAllLinkInJavaScript(webRoot, content, rules))
            break
        default:
            const buffer = Buffer.from(await response.arrayBuffer())
            result.push({
                url, md5: crypto.createHash('md5').update(buffer).digest('hex')
            })
            break
    }
    if (content)
        result.push({
            url, md5: crypto.createHash('md5').update(content).digest('hex')
        })
    return result
}

/** 遍历 HTML 文件中的所有外部链接 */
export async function eachAllLinkInHtml(webRoot: string, content: string, rules: any): Promise<FileMd5[]> {
    const result: FileMd5[] = []
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
            result.push(...await eachAllLinkInUrl(webRoot, url, rules))
        } else if (node.tagName === 'script') {
            result.push(...await eachAllLinkInJavaScript(webRoot, node.rawText, rules))
        } else if (node.tagName === 'style') {
            result.push(...await eachAllLinkInCss(webRoot, node.rawText, rules))
        }
        for (let childNode of node.childNodes) {
            await each(childNode)
        }
    }
    await each(HTMLParser.parse(content, { style: true, script: true }))
    return result
}

/** 遍历 CSS 文件中的所有外部链接 */
export async function eachAllLinkInCss(webRoot: string, content: string, rules: any): Promise<FileMd5[]> {
    const result: FileMd5[] = []
    const each = async (rules: Array<any> | undefined) => {
        if (!rules) return
        for (let rule of rules) {
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
                            result.push(...await eachAllLinkInUrl(webRoot, url, rules))
                        }
                    }
                    break
                case 'import':
                    const url = rule.import.trim().replace(/^["']|["']$/g, '')
                    result.push(...await eachAllLinkInUrl(webRoot, url, rules))
                    break
            }
        }
    }
    await each(CSSParser.parse(content).stylesheet?.rules)
    return result
}

/** 遍历 JS 文件中地所有外部链接 */
export async function eachAllLinkInJavaScript(webRoot: string, content: string, rules: any): Promise<FileMd5[]> {
    const result: FileMd5[] = []
    const ruleList = rules.config.external.js
    for (let value of ruleList) {
        if (typeof value === 'function') {
            const urls: string[] = value(content)
            for (let url of urls) {
                result.push(...await eachAllLinkInUrl(webRoot, url, rules))
            }
        } else {
            const {head, tail} = value
            const reg = new RegExp(`${head}(['"\`])(.*?)(['"\`])${tail}`, 'mg')
            const list = content.match(reg)
                ?.map(it => it.substring(head.length, it.length - tail.length).trim())
                ?.map(it => it.replace(/^['"`]|['"`]$/g, ''))
            if (list) {
                for (let url of list) {
                    result.push(...await eachAllLinkInUrl(webRoot, url, rules))
                }
            }
        }
    }
    return result
}

/** 判断一个 URL 是否是外部链接 */
function isExternalLink(webRoot: string, url: string): boolean {
    return url.startsWith(`https://${webRoot}`)
}

/** 查询缓存规则 */
export function findCache(url: URL, rules: any): string | null {
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

export interface FileMd5 {
    url: string,
    md5: string
}