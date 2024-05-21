import {fetchFile} from '../../Utils'
import {KeyValueDataBase, RuntimeEnvErrorTemplate} from './KeyValueDataBase'

/** 仅在浏览器端执行的函数 */
export type FunctionInBrowser<Args extends any[], R> = (...args: Args) => R

let fetchWrapper: (request: RequestInfo | URL, banCache: boolean, cors: boolean, optional?: RequestInit) => Promise<Response>
let isCors: (request: Request) => boolean
let getFastestUrls: (request: Request) => Request[]
let getStandbyUrls: (request: Request) => {t: number, l: Request[]}
let isFetchSuccessful: (response: Response) => boolean

/** 运行时依赖代码 */
export class RuntimeDepCode extends KeyValueDataBase<FunctionInBrowser<any[], any> | null> {

    constructor() {
        super({
            /** 是否启用 cors */
            isCors: {
                default: (request: Request) => true
            },
            /** 获取竞速列表 */
            getFastestUrls: {
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
                default: async (request: Request, optional?: RequestInit): Promise<Response> => {
                    const fallbackFetch = (request: Request, controller?: AbortController) => {
                        return fetchWrapper(request, true, isCors(request), {
                            ...optional,
                            signal: controller?.signal
                        })
                    }
                    const list = getFastestUrls(request)
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
                default: async (request: Request, optional?: RequestInit): Promise<Response> => {
                    const fallbackFetch = (request: Request, controller?: AbortController) => {
                        return fetchWrapper(request, true, isCors(request), {
                            ...optional,
                            signal: controller?.signal
                        })
                    }
                    const standbyUrls = getStandbyUrls(request)
                    if (!standbyUrls) return fallbackFetch(request)
                    let id: any = 0, standbyResolve: Function, standbyReject: Function
                    const {t: time, l: list} = standbyUrls
                    const controllers = new Array<AbortController>(list.length + 1)
                    const task = () => Promise.any(list.map(
                        (it, index) =>
                            fallbackFetch(it, controllers[index + 1] = new AbortController())
                                .then(response => isFetchSuccessful(response) ? {
                                    i: index + 1, r: response
                                } : Promise.reject(response))
                    )).then(obj => standbyResolve(obj))
                        .catch(() => standbyReject())
                    const firstFetch = fallbackFetch(request, controllers[0] = new AbortController())
                        .then(response => isFetchSuccessful(response) ? {i: 0, r: response} : Promise.reject(response))
                        .catch(err => {
                            clearTimeout(id)
                            // noinspection JSIgnoredPromiseFromCall
                            task()
                            return Promise.reject(err)
                        })
                    const standby = new Promise((resolve1, reject1) => {
                        standbyResolve = resolve1
                        standbyReject = reject1
                        id = setTimeout(task, time)
                    })
                    try {
                        const {i: index, r: response} = await Promise.any([firstFetch, standby]) as any
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

}