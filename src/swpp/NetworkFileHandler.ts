import nodePath from 'path'

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

    fetch(request: RequestInfo | URL): Promise<Response> {
        if (this.fetchingCount !== this.limit) {
            return this.createFetchTask(request)
        } else {
            return new Promise((resolve, reject) => {
                this.waitList.push({request, resolve, reject})
            })
        }
    }

    private async createFetchTask(url: RequestInfo | URL): Promise<Response> {
        ++this.fetchingCount
        try {
            const controller  = new AbortController()
            const clearId = setTimeout(() => controller.abort('timeout'), this.timeout)
            return await fetch(url, {
                referrer: this.referer,
                headers: {
                    ...this.headers,
                    'User-Agent': this.userAgent
                },
                signal: controller.signal
            }).finally(() => clearTimeout(clearId))
        } finally {
            --this.fetchingCount
            if (this.waitList.length !== 0) {
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

}