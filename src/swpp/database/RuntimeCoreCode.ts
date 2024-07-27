import {BrowserVersion} from '../ServiceWorkerRuntimeTypes'
import {KeyValueDatabase} from './KeyValueDatabase'
import {FunctionInBrowser} from './RuntimeDepCode'

let CACHE_NAME: string
let ESCAPE: number
let UPDATE_JSON_URL: string
let UPDATE_CD: number
let VERSION_PATH: string

let readVersion: () => Promise<BrowserVersion | undefined>
let writeVersion: (version: BrowserVersion) => Promise<void>
let postMessage: (type: string, data: any, ...goals: any) => Promise<void>
let markCacheInvalid: (request: RequestInfo | URL) => Promise<void>
let isBlockRequest: (request: Request) => boolean
let modifyRequest: (request: Request) => Request | null | undefined
let normalizeUrl: (url: string) => string
let matchCacheRule: (url: URL) => undefined | null | false | number
let matchFromCaches: (request: RequestInfo | URL) => Promise<Response | undefined>
let isValidCache: (response: Response, rule: number | false | null | undefined) => boolean
let fetchFile: (request: RequestInfo | URL, optional?: RequestInit) => Promise<Response>
let isFetchSuccessful: (response: Response) => boolean
let writeResponseToCache: (request: RequestInfo | URL, response: Response, date?: boolean) => Promise<void>
let fetchWrapper: (request: RequestInfo | URL, banCache: boolean, cors: boolean, optional?: RequestInit) => Promise<Response>
let isCors: (request: Request) => boolean

/**
 * 运行时核心功能代码
 */
export class RuntimeCoreCode extends KeyValueDatabase<FunctionInBrowser<any, any> | null> {

    constructor() {
        super({
            /** 逃生门功能实现 */
            handleEscape: {
                default: (): Promise<void> => readVersion()
                    .then(async oldVersion => {
                        if (oldVersion && oldVersion.escape !== ESCAPE) {
                            await caches.delete(CACHE_NAME)
                            await postMessage('escape', null)
                        }
                    })
            },
            /**
             * 缓存增量更新功能实现
             * @param force 是否强制更新
             * @return 标记缓存是否更新，-1 - 新访客，1 - 仅更新版本号，2 - 更新了缓存，否则 - 没有进行任何更新
             */
            handleUpdate: {
                default: async (force?: boolean): Promise<1 | -1 | 2 | undefined | null | void> => {
                    const oldVersion = await readVersion()
                    if (!force && oldVersion && Date.now() - oldVersion.tp! < UPDATE_CD) return
                    const json: {global: number, info: {version: number, change?: any[]}[]} =
                        await (await fetch(UPDATE_JSON_URL, {
                            // @ts-ignore
                            priority: 'high'
                        })).json()
                    const {global, info} = json
                    const newVersion = {global, local: info[0].version, escape: ESCAPE}
                    // 新访客或触发了逃生门
                    if (!oldVersion || (ESCAPE && ESCAPE !== oldVersion.escape)) {
                        await writeVersion(newVersion)
                        return oldVersion ? 2 : -1
                    }
                    // 已是最新版本时跳过剩余步骤
                    if (oldVersion.global === global && oldVersion.local === newVersion.local) return
                    /**
                     * 尝试匹配一个规则
                     */
                    function matchRule(change: any): (url: string) => boolean|undefined|null {
                        /**
                         * 遍历所有value
                         * @param action 接受value并返回bool的函数
                         * @return 如果 value 只有一个则返回 `action(value)`，否则返回所有运算的或运算（带短路）
                         */
                        const forEachValues = (action: (value: string) => boolean): boolean => {
                            const value = change.value
                            if (Array.isArray(value)) {
                                for (let it of value) {
                                    if (action(it)) return true
                                }
                                return false
                            } else return action(value)
                        }
                        switch (change.flag) {
                            case 'html':
                                return url => /\/$|\.html$/.test(url)
                            case 'end': case 'suf':
                                return url => forEachValues(value => url.endsWith(value))
                            case 'begin': case 'pre':
                                return url => forEachValues(value => url.startsWith(value))
                            case 'str':
                                return url => forEachValues(value => url.includes(value))
                            case 'reg':
                                return url => forEachValues(value => new RegExp(value, 'i').test(url))
                            default:
                                throw change
                        }
                    }
                    // 按版本顺序更新缓存，直到找到当前版本
                    const expressionList: ((url: string) => boolean | null | undefined)[] = []
                    for (let infoElement of info) {
                        if (infoElement.version === oldVersion.local) {
                            const urlList: string[] = []
                            await caches.open(CACHE_NAME)
                                .then(cache => cache.keys())
                                .then(async keys => {
                                    for (let request of keys) {
                                        const url = request.url
                                        if (url !== VERSION_PATH && expressionList.find(it => it(url))) {
                                            await markCacheInvalid(request)
                                            urlList.push(url)
                                        }
                                    }
                                })
                            return postMessage('update', urlList)
                        }
                        const changeList = infoElement.change
                        if (changeList) {
                            for (let change of changeList) {
                                expressionList.push(matchRule(change))
                            }
                        }
                    }
                    // 运行到这里说明版本号丢失
                    await caches.delete(CACHE_NAME)
                        .then(() => writeVersion(newVersion))
                    return postMessage('reset', null)
                }
            },
            handleFetchEvent: {
                default: (event: any) => {
                    let request = event.request
                    if (isBlockRequest(request)) return event.respondWith(new Response(null, {status: 204}))
                    const newRequest = modifyRequest(request)
                    if (newRequest) request = newRequest
                    const cacheKey = new URL(normalizeUrl(request.url))
                    const cacheRule = matchCacheRule(cacheKey)
                    if (cacheRule) {
                        event.respondWith(
                            matchFromCaches(cacheKey).then(cacheResponse => {
                                if (cacheResponse && isValidCache(cacheResponse, cacheRule))
                                    return cacheResponse
                                const responsePromise = fetchFile(request)
                                    .then(response => {
                                        if (isFetchSuccessful(response)) {
                                            // noinspection JSIgnoredPromiseFromCall
                                            writeResponseToCache(cacheKey, response.clone())
                                            return response
                                        }
                                        return cacheResponse ?? response
                                    })
                                return cacheResponse ? responsePromise.catch(() => cacheResponse) : responsePromise
                            })
                        )
                    } else if (newRequest) {
                        event.respondWith(fetchWrapper(request, false, isCors(request)))
                    }
                }
            }
        })
    }

}