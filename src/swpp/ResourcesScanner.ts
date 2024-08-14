import fs from 'fs'
import * as crypto from 'node:crypto'
import nodePath from 'path'
import {AllowNotFoundEnum} from './database/CompilationEnv'
import {JsonBuilder} from './JsonBuilder'
import {CompilationData} from './SwCompiler'
import {exceptionNames, RuntimeException, utils} from './untils'

/**
 * 资源文件扫描器
 */
export class ResourcesScanner {

    constructor(
        private compilation: CompilationData,
        private oldTracker?: FileUpdateTracker
    ) { }

    // noinspection JSUnusedGlobalSymbols
    /** 扫描指定目录下的所有文件 */
    async scanLocalFile(path: string): Promise<FileUpdateTracker> {
        const matchCacheRule = this.compilation.crossDep.read('matchCacheRule')
        const register = this.compilation.fileParser
        const jsonInfo = this.compilation.compilationEnv.read('SWPP_JSON_FILE')
        const excludes = [
            nodePath.posix.join(path, jsonInfo.swppPath, jsonInfo.versionPath),
            nodePath.posix.join(path, jsonInfo.swppPath, jsonInfo.trackerPath),
            nodePath.posix.join(path, this.compilation.compilationEnv.read('SERVICE_WORKER') + '.js')
        ]
        const urls = new Set<string>()
        const tracker = new FileUpdateTracker(this.compilation)
        await traverseDirectory(path, async file => {
            if (excludes.includes(file)) return
            const localUrl = tracker.normalizeUri(file.substring(path.length))
            const isCached = !!matchCacheRule.runOnNode(localUrl)
            if (isCached) {
                tracker.addUrl(localUrl.href)
            }
            const set = await register.parserLocalFile(file, content => {
                if (isCached) {
                    const hash = crypto.createHash('md5')
                    hash.update(content)
                    tracker.update(localUrl.pathname, hash.digest('hex'))
                }
            }, isCached)
            set.forEach(it => urls.add(it))
        })
        await this.scanNetworkFile(tracker, urls)
        return tracker
    }

    /** 扫描网络文件 */
    private async scanNetworkFile(tracker: FileUpdateTracker, urls: Set<string>, record: Set<string> = new Set()) {
        const matchCacheRule = this.compilation.crossDep.read('matchCacheRule')
        const registry = this.compilation.fileParser
        const isStable = this.compilation.compilationEnv.read('isStable')
        const appendedUrls = new Set<string>()
        const taskList = new Array<Promise<void>>(urls.size)
        let i = 0
        for (let url of urls) {
            const normalizeUri = tracker.normalizeUri(url)
            if (record.has(normalizeUri.href)) continue
            record.add(normalizeUri.href)
            const isCached = matchCacheRule.runOnNode(normalizeUri)
            if (isCached) {
                tracker.addUrl(normalizeUri.href)
            }
            if (isStable(normalizeUri)) {
                const oldValue = this.oldTracker?.get?.(normalizeUri.href)
                if (Array.isArray(oldValue)) {
                    const list = tracker.syncStable(normalizeUri, oldValue, this.oldTracker!)
                    list.forEach(it => appendedUrls.add(it))
                    continue
                }
            }
            taskList[i++] = registry.parserUrlFile(normalizeUri.href, !!isCached)
                .then(value => {
                    if (isCached) {
                        tracker.update(value.file, value.mark)
                    }
                    value.urls.forEach(it => appendedUrls.add(it))
                }).catch(err => utils.printError('SCAN NETWORK FILE', err))
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
                        files.map(it => traverseDirectory(nodePath.posix.join(dir, it), callback))
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
    protected headers = new Map<string, any>()
    /** 存储列表，key 为文件路径，value 为文件的唯一标识符 */
    protected map = new Map<string, string>()
    /** 存储所有存在的 URL */
    protected allUrl = new Set<string>()

    constructor(protected compilation: CompilationData) { }

    /** 更新一个文件的标识符 */
    update(uri: string, value: string | Set<string> | string[]) {
        if (typeof value == 'string') {
            if (value.startsWith('[')) {
                throw new RuntimeException(exceptionNames.invalidValue, `插入数据（"${value}"）时，不应当以方括号开头`)
            }
            this.map.set(uri, value)
        } else if (Array.isArray(value)) {
            this.map.set(uri, JSON.stringify(value))
        } else {
            this.map.set(uri, JSON.stringify(Array.from(value)))
        }
    }

    /**
     * 同步指定的稳定资源（同步时会连同同步其连接的稳定资源）
     * @return 直接或间接连接的一些需要扫描的资源
     */
    syncStable(uri: URL, value: string[], oldTracker: FileUpdateTracker): string[] {
        const isStable = this.compilation.compilationEnv.read('isStable')
        this.update(uri.href, value)
        this.addUrl(uri.href)
        const result = []
        for (let item of value) {
            this.addUrl(item)
            const itemUrl = new URL(item)
            if (isStable(itemUrl)) {
                const oldValue = oldTracker.get(item)
                if (Array.isArray(oldValue)) {
                    const son = this.syncStable(itemUrl, oldValue, oldTracker)
                    result.push(...son)
                    continue
                }
            }
            result.push(item)
        }
        return result
    }

    /** 读取一个文件的标识符 */
    get(uri: string): string | string[] | undefined {
        const value = this.map.get(this.normalizeUri(uri).href)
        if (!value) return
        return value.startsWith('[') ? JSON.parse(value) : value
    }

    /** 设置一个 header */
    putHeader(key: string, value: any) {
        this.headers.set(key, value)
    }

    /** 读取一个 header */
    getHeader(key: string): any | undefined {
        return this.headers.get(key)
    }

    /** 归一化 uri */
    normalizeUri(uri: string): URL {
        if (uri.startsWith('http:'))
            uri = `https:${uri.substring(5)}`
        const baseUrl = this.compilation.compilationEnv.read('DOMAIN_HOST')
        const url = new URL(uri, baseUrl)
        const normalizer = this.compilation.crossDep.read('normalizeUrl')
        return new URL(normalizer.runOnNode(url.href))
    }

    /** 添加一个 URL */
    addUrl(url: string) {
        this.allUrl.add(url)
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * 判断两个 tracker 的差异
     * 
     * 当一个文件满足下列条件任意一条时将会被放入到返回值当中：
     *
     * + 在新旧 tracker 中都存在且唯一标识符发生变化
     * + 在新 tracker 中不存在且在旧 tracker 中存在
     */
    async diff(): Promise<JsonBuilder> {
        const baseUrl = this.compilation.compilationEnv.read('DOMAIN_HOST')
        const diff = new JsonBuilder(this.compilation, this.allUrl)
        const oldTracker = await this.compilation.compilationEnv.read('SWPP_JSON_FILE').fetchTrackerFile(this.compilation)
        oldTracker.map.forEach((value, key) => {
            if (this.map.has(key)) {
                if (this.get(key) !== value)
                    diff.update(utils.splicingUrl(baseUrl, key).href, value)
            } else {
                diff.update(utils.splicingUrl(baseUrl, key).href, value)
            }
        })
        this.headers.forEach((value, key) => {
            diff.putHeader(key, {
                oldValue: oldTracker.getHeader(key),
                newValue: value
            })
        })
        return diff
    }

    // noinspection JSUnusedGlobalSymbols
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
            tracker: {} as { [key: string]: string },
            headers: {} as { [key: string]: any }
        }
        this.map.forEach((value, key) => {
            result.tracker[key] = value
        })
        this.headers.forEach((value, key) => {
            result.headers[key] = value
        })
        return JSON.stringify(result)
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
                for (let key in json['external']) {
                    tracker.headers.set(key, json['external'][key])
                }
                for (let key in json.list) {
                    const value = json.list[key]
                    tracker.map.set(key, value.length === 32 ? value : '')
                }
                break
            default: throw new RuntimeException(exceptionNames.unsupportedVersion, `不支持 ${json.version}`)
        }
        return tracker
    }

    // noinspection JSUnusedGlobalSymbols
    /** 从网络拉取并解析 tracker */
    static async parserJsonFromNetwork(compilation: CompilationData): Promise<FileUpdateTracker> {
        const domain = compilation.compilationEnv.read('DOMAIN_HOST')
        const jsonInfo = compilation.compilationEnv.read('SWPP_JSON_FILE')
        const url = utils.splicingUrl(domain, jsonInfo.swppPath, jsonInfo.trackerPath)
        const fetcher = compilation.compilationEnv.read('NETWORK_FILE_FETCHER')
        const isNotFound = compilation.compilationEnv.read('isNotFound')
        const notFoundLevel = compilation.compilationEnv.read('ALLOW_NOT_FOUND')
        let error: RuntimeException
        const result = await (async () => {
            try {
                const response = await fetcher.fetch(url)
                if (isNotFound.response(response)) {
                    if (notFoundLevel == AllowNotFoundEnum.REJECT_ALL) {
                        error = new RuntimeException(exceptionNames.notFound, `拉取 ${url} 时出现 404 错误`)
                        return
                    }
                    utils.printWarning(
                        'SCANNER', '拉取 tracker 时服务器返回了 404，如果是第一次携带 swpp v3 构建网站请忽视这条信息'
                    )
                    return new FileUpdateTracker(compilation)
                }
                const text = await response.text()
                return FileUpdateTracker.unJson(compilation, text)
            } catch (e) {
                if (isNotFound.error(e) && notFoundLevel == AllowNotFoundEnum.ALLOW_ALL) {
                    utils.printWarning(
                        'SCANNER', '拉取 tracker 时 DNS 解析失败，如果是第一次携带 swpp v3 构建网站且网站暂时无法解析请忽视这条信息'
                    )
                    return new FileUpdateTracker(compilation)
                }
                throw new RuntimeException(exceptionNames.error, `拉取或解析历史 Tracker 时出现错误`, { cause: e })
            }
        })()
        if (result) return result
        throw error!
    }

}