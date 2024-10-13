import * as http from 'node:http'
import * as https from 'node:https'
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
    /** HTTP 代理 */
    proxy?: http.Agent
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
        url: string | URL,
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

    fetch(request: string | URL): Promise<Response> {
        return this.fetchHelper(request, 0)
    }

    private fetchHelper(url: string | URL, _count: number): Promise<Response> {
        if (this.fetchingCount < this.limit) {
            return this.createFetchTask(url, _count)
        } else {
            return new Promise((resolve, reject) => {
                this.waitList.push({url, resolve, reject})
            })
        }
    }

    private async createFetchTask(url: string | URL, _count: number = 0): Promise<Response> {
        ++this.fetchingCount
        try {
            const response = await this.request(url.toString(), () => {
                if (this.retryCount > 10) { // 超时请求数量过多时自动降低并发量
                    this.retryCount = 5
                    this.limit = Math.round(this.limit * 2 / 3)
                    utils.printWarning('FETCHER', `超时请求数量过多，已将阈值自动降低为 ${this.limit}`)
                }
            })
            --this.fetchingCount
            return response
        } catch (e) {
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
                this.createFetchTask(item.url)
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

    private request(url: string, onTimeout?: () => void): Promise<Response> {
        return new Promise(async (resolve, reject) => {
            let id: any = undefined
            const isHttps = url.startsWith('https:')
            const client = isHttps ? https : http
            const req = client.get(url, {
                headers: {
                    ...this.headers,
                    referer: this.referer,
                    "user-agent": this.userAgent
                },
                // @ts-ignore
                agent: this['proxy']
            }, response => {
                if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
                    const location = response.headers.location
                    if (!location) {
                        reject(new Error(`GET ${url} Error: 返回了 ${response.statusCode} 但没有包含 Location 字段`))
                    } else {
                        this.request(location, onTimeout)
                            .then(response => resolve(response))
                            .catch(err => reject(err))
                    }
                } else {
                    const bufferArray: Buffer[] = []
                    response.on('data', (chunk: Buffer) => {
                        bufferArray.push(chunk)
                    })
                    response.on('end', () => {
                        clearTimeout(id)
                        const buffer = Buffer.concat(bufferArray)
                        resolve(new Response(buffer, {
                            status: response.statusCode,
                            headers: response.headers as Record<string, string>
                        }))
                    })
                    response.on('error', err => {
                        reject(err)
                    })
                }
            })
            if (this.timeout > 0) {
                id = setTimeout(() => {
                    onTimeout?.()
                    req.destroy(new RuntimeException(exceptionNames.timeout, `GET ${url} Timeout`))
                }, this.timeout)
            }
        })
    }

}