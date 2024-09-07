import * as HTMLParser from 'node-html-parser'
import * as crypto from 'node:crypto'
import nodePath from 'path'
import {CompilationData} from '../SwCompiler'
import {exceptionNames, RuntimeException, utils} from '../untils'
import {KeyValueDatabase} from './KeyValueDatabase'

export type COMMON_TYPE_COMP_FP = ReturnType<typeof buildCommon>

export class CompilationFileParser extends KeyValueDatabase<FileParser<crypto.BinaryLike>, COMMON_TYPE_COMP_FP> {

    constructor() {
        super('CompilationFileParser')
        this.lazyInit(buildCommon(this))
    }

    /** 解析本地文件 */
    async parserLocalFile(path: string, cb?: (content: crypto.BinaryLike) => void, force?: boolean): Promise<Set<string>> {
        const extname = nodePath.extname(path).substring(1)
        if (this.hasKey(extname)) {
            const parser = this.read(extname)
            const content = await parser.readFromLocal(this.compilation, path)
            cb?.(content)
            return await parser.extractUrls(this.compilation, content)
        } else {
            if (force && cb) {
                const reader = this.compilation.compilationEnv.read('readLocalFile')
                const content = await reader(path)
                cb(content)
            }
            return new Set<string>()
        }
    }

    /** 解析网络文件 */
    async parserNetworkFile(response: Response, callback?: (content: crypto.BinaryLike) => Promise<any> | any): Promise<Set<string>> {
        const fileHandler = this.compilation.compilationEnv.read('NETWORK_FILE_FETCHER')
        const contentType = fileHandler.getUrlContentType(response.url, response)
        if (this.hasKey(contentType)) {
            const parser = this.read(contentType)
            const content = await parser.readFromNetwork(this.compilation, response)
            if (callback) await callback(content)
            return await parser.extractUrls(this.compilation, content)
        } else {
            if (callback) {
                const buffer = await response.arrayBuffer()
                const array = new Uint8Array(buffer)
                callback(array)
            }
            return new Set<string>()
        }
    }

    /**
     * 解析指定的 URL
     * @param url 链接
     * @param isCached 该链接指向的资源是否需要缓存
     */
    async parserUrlFile(url: string, isCached: boolean): Promise<FileMark> {
        const fileHandler = this.compilation.compilationEnv.read('NETWORK_FILE_FETCHER')
        const contentType = fileHandler.getUrlContentType(url)
        if (!contentType && !isCached) return { file: url, mark: '', urls: new Set<string>() }
        const parser = this.hasKey(contentType) ? this.read(contentType) : undefined
        if (!parser && !isCached) return { file: url, mark: '', urls: new Set<string>() }
        if (parser?.calcUrl) {
            const result = await parser.calcUrl(url)
            if (result) return {
                file: url,
                ...result
            }
        }
        const fetcher = this.compilation.compilationEnv.read('NETWORK_FILE_FETCHER')
        const urls = new Set<string>()
        let mark = ''
        await fetcher.fetch(url)
            .then(response => this.parserNetworkFile(response, isCached ? content => {
                mark = utils.calcHash(content)
            } : undefined))
            .then(urls => urls.forEach(it => urls.add(it)))
        return { file: url, mark, urls }
    }

    /** 解析指定类型的文件内容 */
    async parserContent(type: string, content: string): Promise<Set<string>> {
        if (!this.hasKey(type)) return new Set<string>()
        const parser = this.read(type)
        return await parser.extractUrls(this.compilation, content)
    }

}

function buildCommon($this: any) {
    const registry = $this as CompilationFileParser
    return {
        html: {
            default: {
                readFromLocal(compilation: CompilationData, path: string): Promise<string> {
                    return compilation.compilationEnv.read('readLocalFile')(path)
                },
                readFromNetwork(_: CompilationData, response: Response): Promise<string> {
                    return response.text()
                },
                async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
                    const baseUrl = compilation.compilationEnv.read("DOMAIN_HOST")
                    const html = HTMLParser.parse(content, {
                        blockTextElements: {
                            script: true, style: true
                        }
                    })
                    const queue = [html]
                    const result = new Set<string>()
                    async function handleItem(item: HTMLParser.HTMLElement) {
                        queue.push(...(item.childNodes ?? []).filter(it => it instanceof HTMLParser.HTMLElement))
                        if (!item.tagName) return
                        switch (item.tagName.toLowerCase()) {
                            case 'script': {
                                const src = item.attributes.src
                                if (src) {
                                    if (!utils.isSameHost(src, baseUrl)) {
                                        result.add(src)
                                    }
                                } else {
                                    const son = await registry.parserContent('js', item.rawText)
                                    son.forEach(it => result.add(it))
                                }
                                break
                            }
                            case 'link': {
                                if (item.attributes.rel !== 'preconnect') {
                                    const href = item.attributes.href
                                    if (!href) {
                                        const son = await registry.parserContent('css', item.rawText)
                                        son.forEach(it => result.add(it))
                                    } else if (!utils.isSameHost(href, baseUrl)) {
                                        result.add(href)
                                    }
                                }
                                break
                            }
                            case 'img': case 'source': case 'iframe': case 'embed': {
                                const src = item.attributes.src
                                if (src && !utils.isSameHost(src, baseUrl)) {
                                    result.add(src)
                                }
                                break
                            }
                            case 'object': {
                                const data = item.attributes.data
                                if (data && !utils.isSameHost(data, baseUrl)) {
                                    result.add(data)
                                }
                                break
                            }
                            case 'style': {
                                const son = await registry.parserContent('css', item.rawText)
                                son.forEach(it => result.add(it))
                                break
                            }
                        }
                    }
                    try {
                        do {
                            const item = queue.pop()!
                            await handleItem(item)
                        } while (queue.length > 0)
                    } catch (e) {
                        throw new RuntimeException(exceptionNames.error, '解析 HTML 时出现错误', { cause: e })
                    }
                    return result
                }
            }
        },
        css: {
            default: {
                readFromLocal(compilation: CompilationData, path: string): Promise<string> {
                    return compilation.compilationEnv.read('readLocalFile')(path)
                },
                readFromNetwork(_: CompilationData, response: Response): Promise<string> {
                    return response.text()
                },
                async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
                    const baseUrl = compilation.compilationEnv.read('DOMAIN_HOST')
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
                            ?.filter(it => !utils.isSameHost(it, baseUrl))
                            ?.forEach(it => urls.add(it))
                    }
                    return urls
                }
            }
        }
    } as const
}

/**
 * 文件处理器
 *
 * 用于处理指定类型的文件，从中提取文件的 mark 和外部链接列表
 */
export interface FileParser<T extends crypto.BinaryLike> {

    /**
     * 从本地读取一个文件
     * @param compilation 编译期依赖
     * @param path 文件路径
     */
    readFromLocal(compilation: CompilationData, path: string): Promise<T>

    /**
     * 从网络读取一个文件
     * @param compilation 编译期依赖
     * @param response 拉取的结果
     */
    readFromNetwork(compilation: CompilationData, response: Response): Promise<T>

    /**
     * 从文件内容中提取 URL
     * @param compilation 编译期依赖
     * @param content 文件内容
     */
    extractUrls(compilation: CompilationData, content: T): Promise<Set<string>>

    /**
     * 计算一个链接对应的资源的标识符及其内部资源
     * @return 返回 undefined/null 表示使用缺省逻辑
     */
    calcUrl?(url: string): Promise<Omit<FileMark, 'file'> | undefined | null>

}

/**
 * 存储文件标识信息
 */
export interface FileMark {

    /** URL */
    file: string
    /**
     * 文件标识符或子文件列表
     *
     * 如果链接为稳定链接，则为子文件列表，否则为文件标识符
     */
    mark: string | Set<string>
    /** URL 列表 */
    urls: Set<string>

}