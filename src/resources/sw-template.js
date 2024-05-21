import {_inlineCodes} from '../swpp/SwCompiler'

/** @type {string} */
let CACHE_NAME, VERSION_PATH, INVALID_KEY, STORAGE_TIMESTAMP
/** @type {number} */
let ESCAPE
/**
 * 缓存规则
 * @type {(url: URL) => undefined | null | false | number}
 */
let matchCacheRule
/**
 * @type {(request: RequestInfo | URL, optional?: RequestInit) => Promise<Response>}
 */
let fetchFile

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
     * @return {boolean}
     */
    const isValidCache = response => {
        const headers = response.headers
        if (headers.has(INVALID_KEY)) return false
        const rule = matchCacheRule(new URL(response.url))
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
        const init = {...optional}
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
                const list = await caches.open(CACHE_NAME)
                    .then(cache => cache.keys())
                    .then(keys => keys?.map(it => it.url))
                await caches.delete(CACHE_NAME)
                const info = await updateJson()
                info.type = 'escape'
                info.list = list
                await postMessage('escape', list)
            }
        })

    /** 处理缓存更新 */
    const handleUpdate = () => {

    }

    /**
     * 处理 fetch 事件
     * @param event {FetchEvent}
     */
    const handleFetchEvent = event => {

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
            handleUpdate()
        }
    })

    self.addEventListener('message', event => {

    })

})()

/* 代码区终点 */