import nodePath from 'path'
import {exceptionNames, RuntimeException, utils} from './untils'

export interface NetworkFileHandler {

    /** 最大并发量 */
    limit: number
    /** 超时时间（毫秒） */
    timeout: number
    /** 拉取文件时使用的 referer */
    referer: string
    /** 拉取文件时使用的 ua */
    userAgent: string
    /** 需要额外写入的 header（不包含 ua） */
    headers: { [name: string]: string }

    /** 拉取文件 */
    fetch(request: RequestInfo | URL): Promise<Response>

    /** 获取指定文件的类型 */
    getUrlContentType(url: string, response?: Response): string

    /**
     * 判断请求失败后是否重试
     * @param request 请求内容
     * @param count 已重试次数（不包括本次）
     * @param err 失败的原因
     */
    isRetry(request: RequestInfo | URL, count: number, err: any): boolean

}

/** 支持并发控制的网络文件拉取工具 */
export class FiniteConcurrencyFetcher implements NetworkFileHandler {

    private fetchingCount = 0
    private waitList = [] as {
        request: RequestInfo | URL,
        resolve: (response: Response) => void,
        reject: (error: any) => void
    }[]

    limit = 100
    timeout = 5000
    referer = 'https://swpp.example.com'
    userAgent = 'swpp-backends'
    headers = {}
    /** 最大重试次数 */
    retryLimit = 3
    /** 重试次数计数 */
    private retryCount = 0

    fetch(request: RequestInfo | URL): Promise<Response> {
        return this.fetchHelper(request, 0)
    }

    private fetchHelper(request: RequestInfo | URL, _count: number): Promise<Response> {
        if (this.fetchingCount < this.limit) {
            return this.createFetchTask(request, _count)
        } else {
            return new Promise((resolve, reject) => {
                this.waitList.push({request, resolve, reject})
            })
        }
    }

    private async createFetchTask(url: RequestInfo | URL, _count: number = 0): Promise<Response> {
        ++this.fetchingCount
        let clearId = undefined
        try {
            const controller  = new AbortController()
            // noinspection JSUnusedAssignment
            clearId = setTimeout(() => {    // 设置超时任务，超过指定时间中断请求
                if (this.retryCount > 10) { // 超时请求数量过多时自动降低并发量
                    this.retryCount = 5
                    this.limit = Math.round(this.limit * 2 / 3)
                    utils.printWarning('FETCHER', `超时请求数量过多，已将阈值自动降低为 ${this.limit}`)
                }
                controller.abort(new RuntimeException(exceptionNames.timeout, `链接[${url.toString()}]访问超时`))
            }, this.timeout)
            const response = await fetch(url, {
                referrer: this.referer,
                keepalive: true,
                headers: {
                    ...this.headers,
                    'User-Agent': this.userAgent
                },
                signal: controller.signal
            })
            clearTimeout(clearId)
            --this.fetchingCount
            return response
        } catch (e) {
            clearTimeout(clearId)
            --this.fetchingCount
            // 出现异常时判断是否需要重试
            if (this.isRetry(url, _count, e)) {
                ++this.retryCount
                utils.printWarning('FETCHER', `自动重试请求：${url}，重试次数：${_count + 1}，重试原因：“${e}”`)
                return this.fetchHelper(url, _count + 1)
            }
            // 如果不需要重试直接向上级抛出异常
            return new Response(null, { status: 600 })
        } finally { // 请求结束后触发等待队列中的任务
            if (this.waitList.length !== 0 && this.fetchingCount < this.limit) {
                const item = this.waitList.pop()!
                this.createFetchTask(item.request)
                    .then(response => item.resolve(response))
                    .catch(err => item.reject(err))
            }
        }
    }

    getUrlContentType(url: string, response?: Response): string {
        let contentType: string
        if (url.endsWith('/')) {
            contentType = 'html'
        } else {
            contentType = nodePath.extname(url).substring(1)
        }
        if (!contentType) {
            if (response)
                contentType = response.headers.get('content-type') ?? ''
            if (contentType.startsWith('text/'))
                contentType = contentType.substring(5)
            if (contentType === 'javascript')
                contentType = 'js'
        }
        return contentType
    }

    isRetry(_request: RequestInfo | URL, count: number, err: any): boolean {
        return count < this.retryLimit && err instanceof RuntimeException && err.code === exceptionNames.timeout
    }

}