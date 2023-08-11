import fs from 'fs'
import {Request, Response} from 'node-fetch'
import nodePath from 'path'
import {SwppConfig} from './SwppConfig'
import {deepFreeze, error} from './Utils'
import {createVariant} from './Variant'

const defConfig: SwppConfig = {
    serviceWorker: {
        escape: 0,
        cacheName: 'kmarBlogCache',
        debug: false
    },
    register: {
        onerror: () => console.error('Service Worker 注册失败！可能是由于您的浏览器不支持该功能！'),
        builder: (root: string, _: any, pluginConfig: SwppConfig) => {
            const registerConfig = pluginConfig.register as any
            const {onerror, onsuccess} = registerConfig
            return `<script>
                (() => {
                    let sw = navigator.serviceWorker
                    let error = ${onerror.toString()}
                    if (!sw?.register('${new URL(root).pathname}sw.js')
                        ${onsuccess ? '?.then(' + onsuccess.toString() + ')' : ''}
                        ?.catch(error)
                    ) error()
                })()
            </script>`
        }
    },
    dom: {},
    json: {
        maxHtml: 15,
        charLimit: 1024,
        merge: [],
        exclude: {
            localhost: [/^\/sw\.js$/],
            other: []
        }
    },
    external: {
        timeout: 5000,
        concurrencyLimit: 100,
        js: [],
        stable: [],
        replacer: (it: string) => it
    }
}

let eventList: ((rules: any) => void)[] | null = []

/**
 * 添加一个 rules 映射事件，这个事件允许用户修改 rules 的内容
 *
 * 执行时按照注册的顺序执行
 */
export function addRulesMapEvent(mapper: (rules: any) => void) {
    if (!eventList) {
        error('AddRulesMapEvent', '规则文件已经加载完成，调用该函数无意义！')
        throw 'addRulesMapEvent 调用时机错误'
    }
    eventList.push(mapper)
}

/**
 * 加载 rules 文件
 * @param root 项目根目录
 * @param fileName rules 文件名称
 * @param selects 附加的可选目录，优先级低于 [root]
 */
export function loadRules(root: string, fileName: string, selects: string[]): SwppRules {
    // 支持的拓展名
    const extensions = ['cjs', 'js']
    // 根目录下的 rules 文件
    const rootPath = extensions.map(it => nodePath.resolve(root, `${fileName}.${it}`))
        .find(it => fs.existsSync(it))
    // 其它可选目录下的 rules 文件
    const selectPath = selects.flatMap(
        value => extensions.map(it => nodePath.resolve(value, `${fileName}.${it}`))
    ).find(it => fs.existsSync(it))
    if (!(rootPath || selectPath)) {
        error('RulesLoader', '未查询到 rules 文件')
        throw '未查询到 rules 文件'
    }
    const rootRules = rootPath ? { ...require(rootPath) } : {}
    const selectRules = selectPath ? require(selectPath) : {}
    const config = rootRules.config ?? {}
    mergeConfig(config, selectRules.config ?? {})
    mergeConfig(config, defConfig)
    Object.assign(rootRules, selectRules)
    rootRules.config = config
    for (let event of eventList!) {
        event(rootRules)
    }
    eventList = null
    return createVariant('swppRules', deepFreeze(rootRules))
}

/** 合并配置项 */
function mergeConfig(dist: any, that: any): any {
    for (let key in that) {
        const distValue = dist[key]
        const thatValue = that[key]
        if (!thatValue) continue
        switch (typeof distValue) {
            case "undefined":
                dist[key] = thatValue
                break
            case "object":
                mergeConfig(distValue, thatValue)
                break
        }
    }
    return dist
}

export interface SwppRules {
    /** 配置项 */
    config: SwppConfig,
    /** 缓存规则 */
    cacheRules?: {
        [propName: string]: CacheRules
    },
    /**
     * 修改 Request
     * @param request 原始 request
     * @param $eject 用于访问通过 [ejectValues] 函数插入的变量，变量名必须为 `$eject`
     * @return 修改后的 Request，不修改的话返回 null 或不返回数据
     */
    modifyRequest?: (request: Request, $eject: any) => Request | undefined,
    /**
     * 获取一个 URL 对应的多个 CDN 的 URL
     *
     * 竞速时除了 URL 外所有参数保持一致
     *
     * @param url 原始 URL
     * @return {?string[]} 返回值不包含则表示去除对原始 URL 地访问。返回 undefined 表示该 URL 不启用竞速
     */
    getRaceUrls?: (url: string) => string[] | undefined,
    /**
     * 获取一个 URL 对应的 URL 列表
     *
     * 访问顺序按列表顺序，所有 URL 访问时参数一致
     *
     * @param url 原始 URL
     * @return {?SpareURLs} 返回 null 或不反悔表示对该 URL 不启用备用 URL 功能
     */
    getSpareUrls?: (url: string) => SpareURLs | undefined,
    /**
     * 判断是否阻塞指定响应
     * @return {boolean} 返回 true 表示阻塞，false 表示不阻塞
     */
    blockRequest?: (url: URL) => boolean,
    /** 插入到 sw 但不在 node 中执行的代码 */
    afterJoin?: VoidFunction,
    /** 插入到 sw 但不在 node 中执行的代码，框架主题禁止覆盖该项 */
    afterTheme?: VoidFunction,
    /** 获取要插入到 sw 中的变量和常量 */
    ejectValues?: (framework: any, rules: SwppRules) => {
        [propName: string]: EjectValue
    },
    /** 允许插入到 sw 的值 */
    external?: string[],
    /**
     * 向指定的 request 发起网络请求（GET）
     *
     * **注意：声明该项后 swpp 内置的“CDN 竞速”“备用 URL”都将失效**
     *
     * @param request 请求信息
     * @param banCache 是否禁用缓存
     * @param spare 备用 URL
     */
    fetchFile?: (request: Request, banCache: boolean, spare?: SpareURLs) => Promise<Response>,
    /** 第三方添加的值 */
    [propName: string]: any
}

export interface CacheRules {
    /** 符合该规则的缓存在进行全局清理时是否清除 */
    clean: boolean,
    /** 是否检查 URL 参数（问号及问号之后的内容） */
    search?: boolean,
    /**
     * 规则匹配器
     * @param url 链接的 URL 对象（对象包括 hash 和 search，但禁止使用 hash，search 为 false 或留空时禁止使用 search）
     * @param $eject 用于访问通过 [ejectValues] 函数插入的变量，变量名必须为 `$eject`
     */
    match: (url: URL, $eject?: any) => boolean
}

export interface SpareURLs {
    /** 超时时间 */
    timeout: number,
    /** URL 列表 */
    list: string[]
}

export interface EjectValue {
    prefix: string,
    value: string | number | boolean | bigint | object | string[] | number[] | boolean[] | bigint[] | object[]
}