import {BrowserVersion} from '../SwCompiler'
import {utils} from '../untils'
import {RuntimeEnvErrorTemplate} from './KeyValueDatabase'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

/** 仅在浏览器端执行的函数 */
export type FunctionInBrowser<Args extends any[], R> = (...args: Args) => R

let CACHE_NAME: string
let VERSION_PATH: string
let INVALID_KEY: string
let STORAGE_TIMESTAMP: string

let matchFromCaches: (request: RequestInfo | URL) => Promise<Response | undefined>
let writeResponseToCache: (request: RequestInfo | URL, response: Response, date?: boolean) => Promise<void>
let fetchWrapper: (request: RequestInfo | URL, banCache: boolean, cors: boolean, optional?: RequestInit) => Promise<Response>
let isCors: (request: Request) => boolean
let getFastestRequests: (request: Request) => Request[] | undefined
let getStandbyRequests: (request: Request) => {t: number, l: (() => Request[])} | undefined
let isFetchSuccessful: (response: Response) => boolean
let fetchStandby: (request: Request, standbyRequests: {t: number, l: (() => Request[])}, optional?: RequestInit) => Promise<Response>
let fetchFastest: (list: Request[], optional?: RequestInit) => Promise<Response>

export type COMMON_KEY_RUNTIME_DEP = ReturnType<typeof buildCommon>

/** 运行时依赖代码 */
export class RuntimeDepCode extends RuntimeKeyValueDatabase<FunctionInBrowser<any[], any> | null, COMMON_KEY_RUNTIME_DEP> {

    constructor() {
        super(buildCommon())
    }

    /** 修正函数 */
    fixDepFunction() {
        const emptyLambda = () => null
        const hasFastestRequests = this.hasValue('getFastestRequests')
        const hasStandbyRequests = this.hasValue('getStandbyRequests')
        const hasFetchFile = this.hasValue('fetchFile')
        if (!hasFastestRequests) {
            this.update('fetchFastest', emptyLambda)
        }
        if (!hasStandbyRequests) {
            this.update('fetchStandby', emptyLambda)
        }
        if (!hasFetchFile) {
            if (hasFastestRequests && hasStandbyRequests) {
                this.update('fetchFile', () => fetchFastestAndStandbyRequests)
            } else if (hasFastestRequests) {
                this.update('fetchFile', () => fetchFastestRequests)
            } else if (hasStandbyRequests) {
                this.update('fetchFile', () => fetchStandbyRequests)
            }
        }
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        return utils.anyToSource(this.entries(), true, 'const')
    }

}

const fetchFastestAndStandbyRequests = (requestOrUrl: RequestInfo | URL, optional?: RequestInit) => {
    // @ts-ignore
    const request = requestOrUrl.url ? requestOrUrl as Request : new Request(requestOrUrl)
    const standbyList = getStandbyRequests(request)
    if (standbyList) return fetchStandby(request, standbyList, optional)
    const fastestList = getFastestRequests(request)
    if (fastestList) return fetchFastest(fastestList, optional)
    return fetchWrapper(request, true, isCors(request), optional)
}

const fetchFastestRequests = (requestOrUrl: RequestInfo | URL, optional?: RequestInit) => {
    // @ts-ignore
    const request = requestOrUrl.url ? requestOrUrl as Request : new Request(requestOrUrl)
    const fastestList = getFastestRequests(request)
    if (fastestList) return fetchFastest(fastestList, optional)
    return fetchWrapper(request, true, isCors(request), optional)
}

const fetchStandbyRequests = (requestOrUrl: RequestInfo | URL, optional?: RequestInit) => {
    // @ts-ignore
    const request = requestOrUrl.url ? requestOrUrl as Request : new Request(requestOrUrl)
    const standbyList = getStandbyRequests(request)
    if (standbyList) return fetchStandby(request, standbyList, optional)
    return fetchWrapper(request, true, isCors(request), optional)
}

function buildCommon() {
    return {
        /** 尝试匹配一个 cache */
        matchFromCaches: {
            default: (request: RequestInfo | URL): Promise<Response | undefined> =>
                caches.match(request, {cacheName: CACHE_NAME})
        },
        /**
         * 将一个 response 写入到 cache 中
         * @param request 请求信息
         * @param response 要写入的 response，注意需要自己克隆 response
         * @param date 是否写入时间戳
         */
        writeResponseToCache: {
            default: async (request: RequestInfo | URL, response: Response, date?: boolean) => {
                if (date) {
                    const headers = new Headers(response.headers)
                    headers.set(STORAGE_TIMESTAMP, new Date().toISOString())
                    response = new Response(response.body, {
                        status: response.status,
                        headers
                    })
                }
                const cache = await caches.open(CACHE_NAME)
                await cache.put(request, response)
            }
        },
        /** 标记一个缓存为废弃缓存 */
        markCacheInvalid: {
            default: (request: RequestInfo | URL) => matchFromCaches(request).then(response => {
                if (!response) return
                const headers = new Headers(response.headers)
                headers.set(INVALID_KEY, '1')
                return writeResponseToCache(
                    request, new Response(response.body, {status: response.status, headers})
                )
            })
        },
        /** 判断指定的缓存是否是有效缓存 */
        isValidCache: {
            default: (response: Response, rule: number) => {
                const headers = response.headers
                if (headers.has(INVALID_KEY)) return false
                if (rule < 0) return true
                const storage = headers.get(STORAGE_TIMESTAMP)
                if (!storage) return true
                const storageDate = new Date(storage).getTime()
                const nowTimestamp = Date.now()
                return nowTimestamp - storageDate < rule
            }
        },
        /** 读取版本号 */
        readVersion: {
            default: (): Promise<BrowserVersion | undefined> => matchFromCaches(VERSION_PATH)
                .then(response => response?.json?.())
        },
        /** 写入版本号 */
        writeVersion: {
            default: (version: BrowserVersion) => {
                version.tp = Date.now()
                return writeResponseToCache(VERSION_PATH, new Response(JSON.stringify(version)))
            }
        },
        /**
         * 向指定客户端发送消息
         * @param type 消息类型
         * @param data 消息体
         * @param goals 客户端对象，留空表示所有客户端
         */
        postMessage: {
            default: (async (type: string, data: any, ...goals) => {
                if (!goals.length) {
                    // @ts-ignore
                    goals = await clients.matchAll()
                }
                const body = {type, data}
                for (let client of goals) {
                    client.postMessage(body)
                }
            }) as FunctionInBrowser<any, any>
        },
        /** 检查请求是否成功 */
        isFetchSuccessful: {
            default: (response: Response) => [200, 301, 302, 307, 308].includes(response.status)
        },
        /** 拉取一个文件 */
        fetchWrapper: {
            default: (request: Request, banCache: boolean, cors: boolean, optional?: RequestInit): Promise<Response> => {
                const init: RequestInit = {
                    referrerPolicy: request.referrerPolicy ?? '',
                    ...optional
                }
                init.cache = banCache ? 'no-store' : 'default'
                if (cors) {
                    init.mode = 'cors'
                    init.credentials = 'same-origin'
                }
                return fetch(request, init)
            }
        },
        /** 是否启用 cors */
        isCors: {
            default: (() => false) as (request: Request) => boolean
        },
        /** 获取竞速列表 */
        getFastestRequests: {
            default: null as FunctionInBrowser<any[], any> | null,
            checker(value: FunctionInBrowser<any[], any> | null) {
                if (value != null && typeof value != 'function') {
                    return {
                        value, message: '传入的对象应当为 function 或 null'
                    } as RuntimeEnvErrorTemplate<FunctionInBrowser<any[], any>>
                }
                return false
            }
        },
        /** 获取备用 URL 列表 */
        getStandbyRequests: {
            default: null as FunctionInBrowser<any[], any> | null,
            checker(value: FunctionInBrowser<any[], any> | null) {
                if (value != null && typeof value != 'function') {
                    return {
                        value, message: '传入的对象应当为 function 或 null'
                    } as RuntimeEnvErrorTemplate<FunctionInBrowser<any[], any>>
                }
                return false
            }
        },
        /** URL 竞速拉取 */
        fetchFastest: {
            default: async (list: Request[], optional?: RequestInit): Promise<Response> => {
                const fallbackFetch = (request: Request, controller?: AbortController) => {
                    return fetchWrapper(request, true, true, {
                        ...optional,
                        signal: controller?.signal
                    })
                }
                const controllers = Array.from({length: list.length}, () => new AbortController())
                try {
                    const {i: index, r: response} = await Promise.any(list.map(
                        (it, index) => fallbackFetch(it, controllers[index])
                            .then(response => isFetchSuccessful(response) ? {i: index, r: response} : Promise.reject(response))
                    ))
                    for (let k = 0; k < list.length; k++) {
                        if (k != index) controllers[k].abort()
                    }
                    return response
                } catch (err: any) {
                    const value = err.errors[0]
                    return value.body ? value : new Response(err.toString(), {status: -1})
                }
            }
        },
        /** 备用 URL */
        fetchStandby: {
            default: async (request: Request, standbyRequests: {t: number, l: () => Request[]}, optional?: RequestInit): Promise<Response> => {
                const fallbackFetch = (request: Request, controller?: AbortController) => {
                    return fetchWrapper(request, true, true, {
                        ...optional,
                        signal: controller?.signal
                    })
                }
                // 需要用到的一些字段，未初始化的后面会进行初始化
                let id: any, standbyResolve: Function, standbyReject: Function
                // 尝试封装 response
                const resolveResponse = (index: number, response: Response) =>
                    isFetchSuccessful(response) ? {i: index, r: response} : Promise.reject(response)
                const {t: time, l: listGetter} = standbyRequests
                const controllers = new Array<AbortController>(listGetter.length + 1)
                // 尝试同时拉取 standbyRequests 中的所有 Request
                const task = () => Promise.any(listGetter().map(
                    (it, index) =>
                        fallbackFetch(it, controllers[index + 1] = new AbortController())
                            .then(response => resolveResponse(index + 1, response))
                )).then(obj => standbyResolve(obj))
                    .catch(() => standbyReject())
                // 尝试拉取初始 request
                const firstFetch = fallbackFetch(request, controllers[0] = new AbortController())
                    .then(response => resolveResponse(0, response))
                    .catch(err => {
                        // 如果失败则跳过等待
                        clearTimeout(id)
                        // noinspection JSIgnoredPromiseFromCall
                        task()
                        return Promise.reject(err)  // 保留当前错误
                    })
                // 延时拉取其它 request
                const standby = new Promise((resolve1, reject1) => {
                    standbyResolve = resolve1
                    standbyReject = reject1
                    id = setTimeout(task, time)
                })
                try {
                    const {i: index, r: response} = await Promise.any([firstFetch, standby]) as any
                    // 中断未完成的请求
                    for (let k = 0; controllers[k]; k++) {
                        if (k != index) controllers[k].abort()
                    }
                    return response
                } catch (err: any) {
                    const value = err.errors[0]
                    return value.body ? value : new Response(err.toString(), {status: -1})
                }
            }
        },
        /** 拉取文件 */
        fetchFile: {
            default: (request: RequestInfo | URL, optional?: RequestInit): Promise<Response> => {
                // @ts-ignore
                if (!request.url) request = new Request(request)
                return fetchWrapper(request, true, true, optional)
            }
        },
        /** 是否阻断请求 */
        isBlockRequest: {
            default: (() => false) as (request: Request) => boolean
        },
        /** 修改请求 */
        modifyRequest: {
            default: (() => null) as (request: Request) => Request | null | undefined
        }
    } as const
}