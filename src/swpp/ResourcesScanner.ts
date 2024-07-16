import fs from 'fs'
import * as crypto from 'node:crypto'
import nodePath from 'path'
import {CompilationEnv} from './database/CompilationEnv'
import {FileParserRegistry} from './FileParser'
import {NetworkFileHandler} from './NetworkFileHandler'
import {utils} from './untils'

/**
 * 资源文件扫描器
 */
export class ResourcesScanner {

    constructor(private env: CompilationEnv) { }

    /** 扫描指定目录下的所有文件 */
    async scanLocalFile(path: string): Promise<LocalFileScanResult> {
        const register = this.env.read('FILE_PARSER') as FileParserRegistry
        const urls = new Set<string>()
        const tracker = new FileUpdateTracker(this.env)
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
        return {urls, tracker}
    }

    /** 扫描网络文件 */
    async scanNetworkFile(data: LocalFileScanResult, urls: Iterable<string> = data.urls) {
        const fetcher = this.env.read('FETCH_NETWORK_FILE') as NetworkFileHandler
        const registry = this.env.read('FILE_PARSER') as FileParserRegistry
        const appendedUrls = new Set<string>()
        const taskList = new Array<Promise<void>>(data.urls.size)
        let i = 0
        for (let url of urls) {
            taskList[i++] = fetcher.fetch(url)
                .then(response => registry.parserNetworkFile(response, content => {
                    data.tracker.update(url, utils.calcHash(content))
                }))
                .then(urls => urls.forEach(it => appendedUrls.add(it)))
                .catch(err => utils.printError('SCAN NETWORK FILE', err))
        }
        await Promise.all(taskList)
        if (appendedUrls.size !== 0)
            await this.scanNetworkFile(data, appendedUrls)
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

    /** 存储列表，key 为文件路径，value 为文件的唯一标识符 */
    private map = new Map<string, string>()

    constructor(private env: CompilationEnv) { }

    /** 更新一个文件的标识符 */
    update(uri: string, value: string) {
        uri = this.normalizeUri(uri)
        this.map.set(uri, value)
    }

    /** 读取一个文件的标识符 */
    get(uri: string) {
        uri = this.normalizeUri(uri)
        return this.map.get(uri)
    }

    /** 归一化 uri */
    private normalizeUri(uri: string): string {
        if (uri.startsWith('http:'))
            uri = `https:${uri.substring(5)}`
        const domain = this.env.read('DOMAIN_HOST') as string
        const url = new URL(uri, `https://${domain}`)
        return url.href
    }

}

/**
 * 本地文件扫描结果
 */
export interface LocalFileScanResult {

    /** 外部 URL 列表 */
    urls: Set<string>

    tracker: FileUpdateTracker

}