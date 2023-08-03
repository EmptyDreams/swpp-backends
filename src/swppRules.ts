import fs from 'fs'
import nodePath from 'path'

const defConfig: SwppConfigTemplate = {
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
        precisionMode: {
            'default': false
        },
        merge: [],
        exclude: {
            localhost: [/^\/sw\.js$/],
            other: []
        }
    },
    external: {
        timeout: 5000,
        js: [],
        skip: [],
        replacer: it => it
    }
}

/**
 * 加载 rules 文件
 * @param root 项目根目录
 * @param fileName rules 文件名称
 * @param selects 附加的可选目录，优先级低于 [root]
 */
export function loadRules(root: string, fileName: string, selects: string[]): any {
    // 支持的拓展名
    const extensions = ['ts', 'cjs', 'js']
    // 根目录下的 rules 文件
    const rootPath = extensions.map(it => nodePath.resolve(root, `${fileName}.${it}`))
        .find(it => fs.existsSync(it))
    // 其它可选目录下的 rules 文件
    const selectPath = selects.flatMap(
        value => extensions.map(it => nodePath.resolve(value, `${fileName}.${it}`))
    ).find(it => fs.existsSync(it))
    if (!(rootPath || selectPath))
        throw '未查询到 rules 文件'
    const rootRules = rootPath ? { ...require(rootPath) } : {}
    const selectRules = selectPath ? require(selectPath) : {}
    const config = rootRules.config ?? {}
    mergeConfig(config, selectRules.config ?? {})
    mergeConfig(config, defConfig)
    Object.assign(rootRules, selectRules)
    rootRules.config = config
    return rootRules
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

/** Service Worker Plus Plus 的配置项 */
export interface SwppConfig {
    /** 有关 ServiceWorker 的配置 */
    serviceWorker: boolean | {
        /** 逃生门 */
        escape: number,
        /** 缓存库名称 */
        cacheName: string,
        /** 是否启用调试 */
        debug: boolean
    },
    /** 与 ServiceWorker 注册有关的配置 */
    register: boolean | {
        /** 注册成功后执行的代码 */
        onsuccess?: VoidFunction,
        /** 注册失败后执行的代码 */
        onerror: VoidFunction
        /**
         * 生成注册 ServiceWorker 的 HTML 代码片段
         * @param root 网页根目录的 URL
         * @param framework 框架对象
         * @param pluginConfig swpp 插件配置项
         */
        builder: (root: string, framework: any, pluginConfig: SwppConfig) => string
    },
    /** 与 DOM 端有关的配置 */
    dom: boolean | {
        /** 缓存更新成功后触发的操作 */
        onsuccess: VoidFunction
    },
    /** 与版本文件相关的配置项 */
    json: boolean | {
        /** 更新缓存时允许更新的最大 HTML 数量 */
        maxHtml: number,
        /** update.json 文件的字符数量限制 */
        charLimit: number,
        /** 文件缓存匹配采用精确模式 */
        precisionMode: any,
        /** 是否合并指定项目 */
        merge: RegExp[],
        /** 生成 cacheList.json 时忽略的文件 */
        exclude: {
            localhost: RegExp[],
            other: RegExp[]
        }
    },
    /** 外部文件更新监听 */
    external: boolean | {
        /** 拉取网络文件的超时时间 */
        timeout: number,
        /** 匹配 JS 代码中的 URL */
        js: ({ head: string, tail: string } | ((jsCode: string) => string[]))[],
        /** URL 监控跳过项目 */
        skip: RegExp[],
        /** 构建过程中将原始 URL 映射为新的 URL */
        replacer: (srcUrl: string) => string[] | string
    }
}

/**
 * Service Worker Plus Plus 的配置项模板
 *
 * 标记为 `undefined` 的值标明该项可不填
 */
export interface SwppConfigTemplate {
    /** 有关 ServiceWorker 的配置 */
    serviceWorker?: boolean | {
        /** 逃生门 */
        escape?: number,
        /** 缓存库名称 */
        cacheName?: string,
        /** 是否启用调试 */
        debug?: boolean
    },
    /** 与 ServiceWorker 注册有关的配置 */
    register: boolean | {
        /** 注册成功后执行的代码 */
        onsuccess?: VoidFunction,
        /** 注册失败后执行的代码 */
        onerror?: VoidFunction,
        /**
         * 生成注册 ServiceWorker 的 HTML 代码片段
         * @param root 网页根目录的 URL
         * @param framework 框架对象
         * @param pluginConfig swpp 插件配置项
         */
        builder?: ((root: string, framework: any, pluginConfig: SwppConfig) => string) | undefined
    },
    /** 与 DOM 端有关的配置 */
    dom?: boolean | {
        /** 缓存更新成功后触发的操作 */
        onsuccess?: VoidFunction
    },
    /** 与版本文件相关的配置项 */
    json?: boolean | {
        /** 更新缓存时允许更新的最大 HTML 数量 */
        maxHtml?: number,
        /** update.json 文件的字符数量限制 */
        charLimit?: number,
        /** 文件缓存匹配采用精确模式 */
        precisionMode?: any,
        /** 是否合并指定项目 */
        merge?: RegExp[],
        /** 生成 cacheList.json 时忽略的文件 */
        exclude?: {
            /** 当前网站的 URL */
            localhost?: RegExp[],
            /** 其它网站的 URL */
            other?: RegExp[]
        }
    },
    /** 外部文件更新监听 */
    external?: boolean | {
        /** 拉取网络文件的超时时间 */
        timeout?: number,
        /** 匹配 JS 代码中的 URL */
        js?: ({ head: string, tail: string } | ((jsCode: string) => string[]))[],
        /** URL 监控跳过项目 */
        skip?: RegExp[],
        /** 构建过程中将原始 URL 映射为新的 URL */
        replacer?: (srcUrl: string) => string[] | string
    }
}