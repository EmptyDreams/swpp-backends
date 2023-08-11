/** Service Worker Plus Plus 的配置项 */
export interface SwppConfig {
    serviceWorker?: ServiceWorkerConfig,
    register?: RegisterConfig,
    dom?: DomConfig,
    json?: VersionJsonConfig,
    external?: ExternalMonitorConfig
}

/** 与 ServiceWorker 有关的配置 */
export interface ServiceWorkerConfig {
    /** 逃生门 */
    escape: number,
    /** 缓存库名称 */
    cacheName: string,
    /** 是否启用调试 */
    debug: boolean
}

/** 与 ServiceWorker 注册有关的配置 */
export interface RegisterConfig {
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
}

/** 与 DOM 端有关的配置 */
export interface DomConfig {
    /** 缓存更新成功后触发的操作 */
    onsuccess?: VoidFunction
}

/** 与版本文件相关的配置项 */
export interface VersionJsonConfig {
    /** 更新缓存时允许更新的最大 HTML 数量 */
    maxHtml: number,
    /** update.json 文件的字符数量限制 */
    charLimit: number,
    /** 是否合并指定项目 */
    merge: string[],
    /** 生成版本信息时忽略的文件 */
    exclude: {
        localhost: RegExp[],
        other: RegExp[]
    }
}

/** 外部文件更新监听 */
export interface ExternalMonitorConfig {
    /** 拉取网络文件的超时时间 */
    timeout: number,
    /** 拉取文件时的并发限制 */
    concurrencyLimit: number,
    /** 匹配 JS 代码中的 URL */
    js: ({ head: string, tail: string } | ((jsCode: string) => string[]))[],
    /** 链接不变内容就不变的 URL */
    stable: RegExp[],
    /** 构建过程中将原始 URL 映射为新的 URL */
    replacer: (srcUrl: string) => string[] | string
}

/** Service Worker Plus Plus 的配置项模板 */
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
    register?: boolean | {
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
        /** 是否合并指定项目 */
        merge?: string[],
        /** 生成版本信息时忽略的文件 */
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
        /** 拉取文件时的并发限制 */
        concurrencyLimit: number,
        /** 匹配 JS 代码中的 URL */
        js?: ({ head: string, tail: string } | ((jsCode: string) => string[]))[],
        /** 链接不变内容就不变的 URL */
        stable?: RegExp[],
        /** 构建过程中将原始 URL 映射为新的 URL */
        replacer?: (srcUrl: string) => string[] | string
    }
}