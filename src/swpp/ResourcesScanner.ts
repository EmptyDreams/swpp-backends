import fs from 'fs'
import * as crypto from 'node:crypto'
import nodePath from 'path'
import {FileParserRegistry} from './FileParser'
import {NetworkFileHandler} from './NetworkFileHandler'
import {CompilationData} from './SwCompiler'
import {exceptionNames, RuntimeException, utils} from './untils'

/**
 * 资源文件扫描器
 */
export class ResourcesScanner {

    constructor(private compilation: CompilationData) { }

    /** 扫描指定目录下的所有文件 */
    async scanLocalFile(path: string): Promise<FileUpdateTracker> {
        const register = this.compilation.env.read('FILE_PARSER') as FileParserRegistry
        const urls = new Set<string>()
        const tracker = new FileUpdateTracker(this.compilation)
        await traverseDirectory(path, async file => {
            const stream = fs.createReadStream(path)
            const hash = crypto.createHash('md5')
            stream.on('data', data => hash.update(data))
            const type = nodePath.extname(file)
            if (register.containsType(type)) {
                const set = await register.parserLocalFile(file)
                set.forEach(it => urls.add(it))
            }
            await new Promise<void>((resolve, reject) => {
                stream.on('end', () => {
                    tracker.update(file, hash.digest('hex'))
                    resolve()
                })
                stream.on('error', err => reject(err))
            })
        })
        await this.scanNetworkFile(tracker, urls)
        return tracker
    }

    /** 扫描网络文件 */
    private async scanNetworkFile(tracker: FileUpdateTracker, urls: Set<string>, record: Set<string> = new Set()) {
        const fetcher = this.compilation.env.read('FETCH_NETWORK_FILE') as NetworkFileHandler
        const registry = this.compilation.env.read('FILE_PARSER') as FileParserRegistry
        const appendedUrls = new Set<string>()
        const taskList = new Array<Promise<void>>(urls.size)
        let i = 0
        for (let url of urls) {
            const normalizeUri = tracker.normalizeUri(url)
            if (record.has(normalizeUri)) continue
            record.add(normalizeUri)
            taskList[i++] = fetcher.fetch(normalizeUri)
                .then(response => registry.parserNetworkFile(response, content => {
                    tracker.update(normalizeUri, utils.calcHash(content))
                }))
                .then(urls => urls.forEach(it => appendedUrls.add(it)))
                .catch(err => utils.printError('SCAN NETWORK FILE', err))
        }
        await Promise.all(taskList)
        if (appendedUrls.size !== 0)
            await this.scanNetworkFile(tracker, appendedUrls, record)
    }

}

/**
 * 遍历目录下的所有文件
 * @param dir
 * @param callback
 */
async function traverseDirectory(dir: string, callback: (file: string) => Promise<any> | any): Promise<void> {
    const stats = fs.lstatSync(dir)
    if (stats.isDirectory()) {
        await new Promise<void>((resolve, reject) => {
            fs.readdir(dir, (err, files) => {
                if (err) reject(err)
                else {
                    Promise.all(
                        files.map(it => traverseDirectory(nodePath.join(dir, it), callback))
                    ).then(() => resolve())
                }
            })
        })
    } else {
        await callback(dir)
    }
}

/**
 * 文件更新监听器
 */
export class FileUpdateTracker {

    /** 附加信息 */
    private headers = new Map<string, any>()
    /** 存储列表，key 为文件路径，value 为文件的唯一标识符 */
    private map = new Map<string, string>()

    constructor(private compilation: CompilationData) { }

    /** 更新一个文件的标识符 */
    update(uri: string, value: string) {
        this.map.set(uri, value)
    }

    /** 读取一个文件的标识符 */
    get(uri: string) {
        uri = this.normalizeUri(uri)
        return this.map.get(uri)
    }

    /** 归一化 uri */
    normalizeUri(uri: string): string {
        if (uri.startsWith('http:'))
            uri = `https:${uri.substring(5)}`
        const domain = this.compilation.env.read('DOMAIN_HOST') as string
        const url = new URL(uri, `https://${domain}`)
        return url.href
    }

    /**
     * 将数据序列化为 JSON
     *
     * 具体格式为：
     *
     * ```json
     * {
     *   "version": 4,
     *   "headers": {
     *     [key: string]: any
     *   },
     *   "tracker" {
     *     [uri: string]: string
     *   }
     * }
     * ```
     */
    json(): string {
        const result = {
            version: 4,
            tracker: {} as { [key: string]: string }
        }
        this.map.forEach((value, key) => {
            result.tracker[key] = value
        })
        return JSON.stringify(result.tracker)
    }

    /** 解序列化数据 */
    static unJson(compilation: CompilationData, jsonStr: string): FileUpdateTracker {
        const tracker = new FileUpdateTracker(compilation)
        const json = JSON.parse(jsonStr)
        switch (json.version) {
            case 4:
                for (let key in json.headers) {
                    tracker.headers.set(key, json.headers[key])
                }
                for (let key in json.tracker) {
                    tracker.map.set(key, json.tracker[key])
                }
                break
            case 3:
                for (let key in json.external) {
                    tracker.headers.set(key, json.external[key])
                }
                for (let key in json.list) {
                    const value = json.list[key]
                    tracker.map.set(key, value.length === 32 ? value : '')
                }
                break
            default: throw {
                code: exceptionNames.unsupportedVersion,
                message: `不支持 ${json.version}`,
            } as RuntimeException
        }
        return tracker
    }

}