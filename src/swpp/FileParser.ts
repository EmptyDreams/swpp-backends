import * as crypto from 'node:crypto'
import nodePath from 'path'
import {CompilationData} from './SwCompiler'

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
        return parser.extractUrls(this.compilation, content)
    }

    /** 解析网络文件 */
    async parserNetworkFile(response: Response, callback?: (content: crypto.BinaryLike) => Promise<any> | any): Promise<Set<string>> {
        const url = response.url
        let contentType: string
        if (url.endsWith('/')) {
            contentType = 'html'
        } else {
            contentType = nodePath.extname(url)
        }
        if (!contentType) {
            if (contentType.startsWith('text/'))
                contentType = contentType.substring(5)
            if (contentType === 'javascript')
                contentType = 'script'
        }
        const parser = this.map.get(contentType)
        if (!parser) return new Set<string>()
        const content = await parser.readFromNetwork(this.compilation, response)
        if (callback) await callback(content)
        return parser.extractUrls(this.compilation, content)
    }

    /** 解析指定类型的文件内容 */
    async parserContent(type: string, content: string): Promise<Set<string>> {
        const parser = this.map.get(type)
        if (!parser) return new Set<string>()
        return parser.extractUrls(this.compilation, content)
    }

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

}

export function buildFileParser<T extends crypto.BinaryLike>(parser: FileParser<T>): FileParser<T> {
    return parser
}