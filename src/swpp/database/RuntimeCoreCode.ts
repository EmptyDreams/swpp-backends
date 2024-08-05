import {UpdateChangeExp, UpdateJson} from '../JsonBuilder'
import {BrowserVersion} from '../SwCompiler'
import {utils} from '../untils'
import {FunctionInBrowser} from './RuntimeDepCode'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

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
let matchUpdateRule: (change: UpdateChangeExp) => ((url: string) => boolean|undefined|null)

export type COMMON_TYPE_RUNTIME_CORE = ReturnType<typeof buildCommon>

/**
 * 运行时核心功能代码
 */
export class RuntimeCoreCode extends RuntimeKeyValueDatabase<FunctionInBrowser<any[], any> | null, COMMON_TYPE_RUNTIME_CORE> {

    constructor() {
        super(buildCommon())
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        return utils.anyToSource(this.entries(), true, 'const')
    }

}

function buildCommon() {
    return {
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
         * @return 标记缓存是否更新，-1 - 新访客，1 - 仅更新版本号，2 - 更新了缓存，string[] - 更新了部分缓存，否则 - 没有进行任何更新
         */
        handleUpdate: {
            default: async (
                oldVersion: BrowserVersion | undefined, force?: boolean
            ): Promise<1 | -1 | 2 | undefined | null | void | string[]> => {
                if (!force && oldVersion && Date.now() - oldVersion.tp! < UPDATE_CD) return
                const json: UpdateJson =
                    await (await fetch(UPDATE_JSON_URL, {
                        // @ts-ignore
                        priority: 'high'
                    })).json()
                const {global, info} = json
                const newVersion: BrowserVersion = {global, local: info[0].version, escape: ESCAPE}
                // 新访客或触发了逃生门
                if (!oldVersion || (ESCAPE && ESCAPE !== oldVersion.escape)) {
                    await writeVersion(newVersion)
                    return oldVersion ? 1 : -1
                }
                // 已是最新版本时跳过剩余步骤
                if (oldVersion.global === global && oldVersion.local === newVersion.local) return
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
                        return urlList
                    }
                    const changeList = infoElement.change
                    if (changeList) {
                        for (let change of changeList) {
                            expressionList.push(matchUpdateRule(change))
                        }
                    }
                }
                // 运行到这里说明版本号丢失
                await caches.delete(CACHE_NAME)
                    .then(() => writeVersion(newVersion))
                return 2
            }
        },
        /** 处理网络请求事件 */
        handleFetchEvent: {
            default: (event: Event) => {
                // @ts-ignore
                let request = event.request as Request
                if (request.method !== 'GET' || !request.url.startsWith('http')) return
                if (isBlockRequest(request)) {
                    // @ts-ignore
                    return event.respondWith(new Response(null, {status: 204}))
                }
                const newRequest = modifyRequest(request)
                if (newRequest) request = newRequest
                const cacheKey = new URL(normalizeUrl(request.url))
                const cacheRule = matchCacheRule(cacheKey)
                if (cacheRule) {
                    // @ts-ignore
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
                    // @ts-ignore
                    event.respondWith(fetchWrapper(request, false, isCors(request)))
                }
            }
        }
    } as const
}