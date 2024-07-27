import {_inlineCodes} from '../swpp/SwCompiler'

/** @type {string} */
let CACHE_NAME, VERSION_PATH, INVALID_KEY, STORAGE_TIMESTAMP, UPDATE_JSON_URL
/** @type {number} */
let ESCAPE, UPDATE_CD
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

    _inlineCodes._insertDepCode()

    /* no_deps_fun 结束 */

    // 核心功能区域
    $$inject_mark_range_start('core')

    _inlineCodes._insertCoreCode()

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

    // 后台检查更新
    self.addEventListener('periodicSync', event => {
        if (event.tag === 'update') {
            event.waitUntil(handleUpdate(true))
        }
    })

    self.addEventListener('message', event => {
        const data = event.data
        switch (data.type) {
            case 'update':
                // noinspection JSIgnoredPromiseFromCall
                handleUpdate()
                break
        }
    })

    /* event 结束 */

})()

/* 代码区终点 */