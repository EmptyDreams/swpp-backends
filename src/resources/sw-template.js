import {_inlineCodes} from '../swpp/SwCompiler'

/** @type {string} */
let CACHE_NAME, VERSION_PATH, INVALID_KEY, STORAGE_TIMESTAMP, UPDATE_JSON_URL
/** @type {number} */
let ESCAPE
/**
 * 缓存规则
 * @type {(url: URL) => undefined | null | false | number}
 */
let matchCacheRule
/** @type {(request: RequestInfo | URL, optional?: RequestInit) => Promise<Response>} */
let fetchFile
/** @type {(request: Request) => boolean} */
let isBlockRequest
/** @type {(request: Request) => Request | null | undefined} */
let modifyRequest
/** @type {(url: string) => string} */
let normalizeUrl
/** @type {(request: Request) => boolean} */
let isCors

/**
 * 标记一段区域的起点
 * @param flag {string}
 * @private
 */
function $$inject_mark_range_start(flag) {}

/**
 * 判断是否存在指定的环境变量
 * @param key {string}
 * @return {boolean}
 */
function $$has_runtime_env(key) {}

/* 代码区起点 */

(() => {
    // 变量/常亮池区域
    $$inject_mark_range_start('var')

    // 在这里插入环境变量
    _inlineCodes._insertRuntimeEnv()

    /* var 结束 */

    // 无外部依赖的工具函数区域（允许内部依赖）
    $$inject_mark_range_start('no_deps_fun')

    /**
     * 尝试匹配一个 cache
     * @param request {RequestInfo | URL}
     * @return {Promise<Response | undefined>}
     */
    const matchFromCaches = request => caches.match(request, {cacheName: CACHE_NAME})

    /**
     * 将一个 response 写入到 cache
     * @param request {RequestInfo | URL}
     * @param response {Response} 注意需要自己克隆 response
     * @param date {boolean?} 是否写入时间戳
     * @return {Promise<void>}
     */
    const writeResponseToCache = (request, response, date) => {
        if (date) {
            const headers = new Headers(response.headers)
            headers.set(STORAGE_TIMESTAMP, new Date().toISOString())
            response = new Response(response.body, {
                status: response.status,
                headers
            })
        }
        return caches.open(CACHE_NAME).then(cache => cache.put(request, response))
    }

    /**
     * 标记一个缓存为废弃缓存
     * @param request {RequestInfo | URL}
     * @return {Promise<void>}
     */
    const markCacheInvalid = request => matchFromCaches(request).then(response => {
        if (!response) return
        const headers = new Headers(response.headers)
        headers.set(INVALID_KEY, '1')
        return writeResponseToCache(
            request, new Response(response.body, {status: response.status, headers})
        )
    })

    /**
     * 判断指定的缓存是否是有效缓存
     * @param response {Response}
     * @param rule {?(number | false | null | undefined)}
     * @return {boolean}
     */
    const isValidCache = (response, rule) => {
        const headers = response.headers
        if (headers.has(INVALID_KEY)) return false
        if (!rule) rule = matchCacheRule(new URL(response.url))
        if (!rule) return false
        if (rule < 0) return true
        const storage = headers.get(STORAGE_TIMESTAMP)
        if (!storage) return true
        const storageDate = new Date(storage).getTime()
        const nowTimestamp = Date.now()
        return nowTimestamp - storageDate < rule
    }

    /**
     * 读取本地版本号
     * @return {Promise<BrowserVersion|undefined>}
     */
    const readVersion = () => matchFromCaches(VERSION_PATH)
        .then(response => response?.json?.())

    /**
     * 写入版本号
     * @param version {BrowserVersion}
     * @return {Promise<void>}
     */
    const writeVersion = version => writeResponseToCache(VERSION_PATH, new Response(JSON.stringify(version)))

    /**
     * 向指定客户端发送消息
     * @param type {string} 消息类型
     * @param data {any} 消息体
     * @param goals {Client} 客户端对象，留空表示所有客户端
     * @return {Promise<void>}
     */
    const postMessage = async (type, data, ...goals) => {
        if (!goals.length) {
            // noinspection JSUnresolvedReference
            goals = await clients.matchAll()
        }
        const body = {type, data}
        for (let client of goals) {
            client.postMessage(body)
        }
    }

    /**
     * 检查请求是否成功
     * @param response {Response}
     * @return {boolean}
     */
    const isFetchSuccessful = response => response.ok || [301, 302, 307, 308].includes(response.status)

    /**
     * @param request {RequestInfo | URL}
     * @param banCache {boolean} 是否禁用缓存
     * @param cors {boolean} 是否启用 cors
     * @param optional {RequestInit?} 额外的配置项
     * @return {Promise<Response>}
     */
    const fetchWrapper = (request, banCache, cors, optional) => {
        /** @type {RequestInit} */
        const init = {
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

    _inlineCodes._insertDepCode()

    /* no_deps_fun 结束 */

    // 核心功能区域
    $$inject_mark_range_start('core')

    /** 处理逃生门 */
    const handleEscape = () => readVersion()
        .then(async oldVersion => {
            // noinspection JSIncompatibleTypesComparison
            if (oldVersion && oldVersion.escape !== ESCAPE) {
                await caches.delete(CACHE_NAME)
                await postMessage('escape', null)
            }
        })

    /**
     * 处理缓存更新
     * @return {Promise<-1|1|2|undefined|null>} 标记缓存是否更新，-1 - 新访客，1 - 仅更新版本号，2 - 更新了缓存，否则 - 没有进行任何更新
     */
    const handleUpdate = async () => {
        const [response, oldVersion] = await Promise.all([fetch(UPDATE_JSON_URL, {priority: 'high'}), readVersion()])
        // noinspection JSUnresolvedReference
        /** @type {{global: number, info: {version: number, change?: any[]}[]}}  */
        const json = await response.json()
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
         * @return {function(url: string): boolean|undefined|null}
         */
        function matchRule(change) {
            /**
             * 遍历所有value
             * @param action {function(string): boolean} 接受value并返回bool的函数
             * @return {boolean} 如果 value 只有一个则返回 `action(value)`，否则返回所有运算的或运算（带短路）
             */
            const forEachValues = action => {
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
        const expressionList = []
        for (let infoElement of info) {
            if (infoElement.version === oldVersion.local) {
                const urlList = []
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

    /**
     * 处理 fetch 事件
     * @param event {FetchEvent}
     */
    const handleFetchEvent = event => {
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

    /* core 结束 */

    // 事件注册区域
    $$inject_mark_range_start('event')

    self.addEventListener(
        'install',
        () => Promise.all([self.skipWaiting(), handleEscape()])
    )

    // sw 激活后立即对所有页面生效，而非等待刷新
    // noinspection JSUnresolvedReference
    self.addEventListener('activate', event => event.waitUntil(clients.claim()))

    self.addEventListener('fetch', handleFetchEvent)

    self.addEventListener('periodicSync', event => {
        if (event.tag === 'update') {
            event.waitUntil(handleUpdate())
        }
    })

    self.addEventListener('message', event => {

    })

    /* event 结束 */

})()

/* 代码区终点 */