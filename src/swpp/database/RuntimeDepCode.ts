import {KeyValueDataBase, RuntimeEnvErrorTemplate} from './KeyValueDataBase'

/** 仅在浏览器端执行的函数 */
export type FunctionInBrowser<Args extends any[], R> = (...args: Args) => R

let fetchWrapper: (request: RequestInfo | URL, banCache: boolean, cors: boolean, optional?: RequestInit) => Promise<Response>
let isCors: (request: Request) => boolean
let getFastestRequests: (request: Request) => Request[]
let getStandbyRequests: (request: Request) => {t: number, l: Request[]}
let isFetchSuccessful: (response: Response) => boolean
let fetchStandby: (request: Request, standbyRequests: {t: number, l: Request[]}, optional?: RequestInit) => Promise<Response>
let fetchFastest: (list: Request[], optional?: RequestInit) => Promise<Response>

/** 运行时依赖代码 */
export class RuntimeDepCode extends KeyValueDataBase<FunctionInBrowser<any[], any> | null> {

    constructor() {
        super({
            /** 是否启用 cors */
            isCors: {
                default: (() => true) as (request: Request) => boolean
            },
            /** 获取竞速列表 */
            getFastestRequests: {
                default: null,
                checker(value) {
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
                default: null,
                checker(value) {
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
                        return fetchWrapper(request, true, isCors(request), {
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
                default: async (request: Request, standbyRequests: {t: number, l: Request[]}, optional?: RequestInit): Promise<Response> => {
                    const fallbackFetch = (request: Request, controller?: AbortController) => {
                        return fetchWrapper(request, true, isCors(request), {
                            ...optional,
                            signal: controller?.signal
                        })
                    }
                    // 需要用到的一些字段，未初始化的后面会进行初始化
                    let id: any, standbyResolve: Function, standbyReject: Function
                    // 尝试封装 response
                    const resolveResponse = (index: number, response: Response) =>
                        isFetchSuccessful(response) ? {i: index, r: response} : Promise.reject(response)
                    const {t: time, l: list} = standbyRequests
                    const controllers = new Array<AbortController>(list.length + 1)
                    // 尝试同时拉取 standbyRequests 中的所有 Request
                    const task = () => Promise.any(list.map(
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
                    return fetchWrapper(request, true, isCors(request as Request), optional)
                }
            }
        })
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