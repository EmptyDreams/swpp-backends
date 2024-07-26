import * as crypto from 'node:crypto'
import nodePath from 'path'
import {NetworkFileHandler} from './NetworkFileHandler'
import {CompilationData} from './SwCompiler'
import {utils} from './untils'

export class FileParserRegistry {

    private map = new Map<string, FileParser<any>>();

    constructor(private compilation: CompilationData, obj: { [key: string]: FileParser<any> } = {}) {
        for (let key in obj) {
            this.map.set(key, obj[key])
        }
    }

    registry(type: string, parser: FileParser<any>) {
        this.map.set(type, parser)
    }

    /** 判断是否支持指定类型 */
    containsType(type: string): boolean {
        return this.map.has(type)
    }

    /** 解析本地文件 */
    async parserLocalFile(path: string): Promise<Set<string>> {
        const parser = this.map.get(nodePath.extname(path))
        if (!parser) return new Set<string>()
        const content = await parser.readFromLocal(this.compilation, path)
        return await parser.extractUrls(this.compilation, content)
    }

    /** 解析网络文件 */
    async parserNetworkFile(response: Response, callback?: (content: crypto.BinaryLike) => Promise<any> | any): Promise<Set<string>> {
        const contentType = FileParserRegistry.getUrlType(response.url, response)
        const parser = this.map.get(contentType)
        if (!parser) return new Set<string>()
        const content = await parser.readFromNetwork(this.compilation, response)
        if (callback) await callback(content)
        return await parser.extractUrls(this.compilation, content)
    }

    /** 解析指定的 URL */
    async parserUrlFile(url: string): Promise<FileMark> {
        const contentType = FileParserRegistry.getUrlType(url)
        const parser = this.map.get(contentType)
        if (contentType && parser?.calcUrl) {
            const result = await parser.calcUrl(url)
            if (result) return {
                file: url,
                ...result
            }
        }
        const fetcher = this.compilation.env.read('FETCH_NETWORK_FILE') as NetworkFileHandler
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

    private static getUrlType(url: string, response?: Response): string {
        let contentType: string
        if (url.endsWith('/')) {
            contentType = 'html'
        } else {
            contentType = nodePath.extname(url)
        }
        if (!contentType) {
            if (response)
                contentType = response.headers.get('content-type') ?? ''
            if (contentType.startsWith('text/'))
                contentType = contentType.substring(5)
            if (contentType === 'javascript')
                contentType = 'script'
        }
        return contentType
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

export interface FileMark {

    /** URL */
    file: string
    /** 文件标识符 */
    mark: string
    /** URL 列表 */
    urls: Set<string>

}

export function buildFileParser<T extends crypto.BinaryLike>(parser: FileParser<T>): FileParser<T> {
    return parser
}