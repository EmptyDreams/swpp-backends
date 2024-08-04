import * as crypto from 'node:crypto'
import nodePath from 'path'
import {FileUpdateTracker} from './ResourcesScanner'
import {CompilationData} from './SwCompiler'
import {utils} from './untils'

export class FileParserRegistry {

    private map = new Map<string, FileParser<any>>();

    constructor(
        private compilation: CompilationData,
        private oldTracker?: FileUpdateTracker
    ) { }

    /** 注册一种处理器 */
    registry(type: string, parser: FileParser<any>) {
        this.map.set(type, parser)
    }

    /** 判断是否支持指定类型 */
    containsType(type: string): boolean {
        return this.map.has(type)
    }

    /** 解析本地文件 */
    async parserLocalFile(path: string): Promise<Set<string>> {
        const parser = this.map.get(nodePath.extname(path).substring(1))
        if (!parser) return new Set<string>()
        const content = await parser.readFromLocal(this.compilation, path)
        return await parser.extractUrls(this.compilation, content)
    }

    /** 解析网络文件 */
    async parserNetworkFile(response: Response, callback?: (content: crypto.BinaryLike) => Promise<any> | any): Promise<Set<string>> {
        const fileHandler = this.compilation.compilationEnv.read('NETWORK_FILE_FETCHER')
        const contentType = fileHandler.getUrlContentType(response.url, response)
        const parser = this.map.get(contentType)
        if (!parser) return new Set<string>()
        const content = await parser.readFromNetwork(this.compilation, response)
        if (callback) await callback(content)
        return await parser.extractUrls(this.compilation, content)
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
        const parser = this.map.get(contentType)
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
            .then(response => this.parserNetworkFile(response, content => {
                mark = utils.calcHash(content)
            }))
            .then(urls => urls.forEach(it => urls.add(it)))
        return { file: url, mark, urls }
    }

    /** 解析指定类型的文件内容 */
    async parserContent(type: string, content: string): Promise<Set<string>> {
        const parser = this.map.get(type)
        if (!parser) return new Set<string>()
        return await parser.extractUrls(this.compilation, content)
    }

    // /** 过滤 URL，仅保留永久缓存的 URL */
    // private filterUrl(urls: Set<string>) {
    //     const matchCacheRule = this.compilation.crossDep.read('matchCacheRule')
    //         .runOnNode as (url: URL) => undefined | null | false | number
    //     urls.forEach(value => {
    //         const url = new URL(value)
    //         const cacheRule = matchCacheRule(url)
    //         if (typeof cacheRule !== 'number' || cacheRule >= 0) {
    //             urls.delete(value)
    //         }
    //     })
    // }

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

export function buildFileParser<T extends crypto.BinaryLike>(parser: FileParser<T>): FileParser<T> {
    return parser
}