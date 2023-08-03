import {readRules} from "./swppRules";
import fetch from "node-fetch";

const logger = require('hexo-log').default({
    debug: false,
    silent: false
})

export interface EjectData {
    strValue: string,
    nodeEject: any
}

let ejectData: EjectData | undefined = undefined

/**
 * 获取 eject values
 * @param framework 框架对象
 * @param rules swpp rules 对象
 */
export function calcEjectValues(framework: any) {
    const rules = readRules()
    if (!('ejectValues' in rules)) return
    // noinspection JSUnresolvedReference
    const eject = rules.ejectValues(framework, rules)
    const nodeEject: any = {}
    let ejectStr = ''
    for (let key in eject) {
        if (!key.match(/^[A-Za-z0-9]+$/)) {
            logger.error(`[SWPP EjectValues] 变量名 [${key}] 仅允许包含英文字母和阿拉伯数字！`)
            throw '变量名违规：' + key
        }
        const data = eject[key]
        const str = getSource(data.value, name => {
            if (['string', 'number', 'boolean', 'object', 'array', 'bigint'].includes(name))
                return true
            logger.error(`[SWPP EjectValue] 不支持导出 ${name} 类型的数据`)
            throw `不支持的键值：key=${key}, value type=${name}`
        })
        ejectStr += `    ${data.prefix} ${key} = ${str}\n`
        nodeEject[key] = data.value
    }
    ejectData = {
        strValue: ejectStr,
        nodeEject
    }
}

/** 读取最近的已计算的 eject 数据 */
export function readEjectData(): EjectData {
    if (!ejectData) throw 'eject data 尚未初始化'
    return ejectData
}

/**
 * 获取指定值的 js 源码表达形式
 * @param obj 要转换的对象
 * @param typeChecker 类型检查器，用于筛除不希望映射的类型
 * @param whiteList 白名单，当 obj 为 Object 时将只转换在白名单中的值（不会传递）
 * @param isTop 是否为顶层元素，为 true 且 obj 为 Object 时将去除最外层的大括号，改为 let（不会传递）
 */
export function getSource(
    obj: any,
    typeChecker: ((name: string) => boolean) | undefined = undefined,
    whiteList: string[] | undefined = undefined,
    isTop: boolean = false
): string {
    const type = typeof obj
    if (typeChecker) {
        let value
        if (type === 'object') {
            value = Array.isArray(obj) ? 'array' : type
        } else value = type
        if (!typeChecker(value)) return ''
    }
    switch (type) {
        case "undefined": return 'undefined'
        case "object":
            if (Array.isArray(obj)) {
                return '[' + (obj as Array<any>).map(it => getSource(it)).join(', ') + ']'
            } else {
                let result = isTop ? '' : '{\n'
                result += Object.getOwnPropertyNames(obj)
                    .filter(key => !whiteList || whiteList.includes(key))
                    .map(key => {
                        const value = obj[key]
                        let str = getSource(value, typeChecker)
                        if (str.length === 0) return ''
                        if (isTop && whiteList && ['cacheList', 'modifyRequest'].includes(key)) {
                            str = str.replace(/\(\s*(.*?)\s*,\s*\$eject\s*\)/g, "$1")
                                .replaceAll(/\$eject\.(\w+)/g, (_, match) => `eject${match[0].toUpperCase()}${match.substring(1)}`)
                        }
                        return isTop ? `let ${key} = ${str}` : `${key}: ${str}`
                    })
                    .filter(it => it.length !== 0)
                    .join(isTop ? '\n' : ',\n')
                result += isTop ? '' : '}\n'
                return result
            }
        case "string":
            if (!obj.includes("'"))
                return `'${obj}'`
            else if (!obj.includes('"'))
                return `"${obj}"`
            else if (!obj.includes('`'))
                return `\`${obj}\``
            else
                return `'${(obj as string).replaceAll("'", "\\'")}'`
        case "bigint": return `${obj.toString()}n`
        default: return obj.toString()
        case "symbol":
            logger.error("[SWPP ServiceWorkerBuilder] 不支持写入 symbol 类型，请从 sw-rules.js 中移除相关内容！")
            throw '不支持写入 symbol 类型'
    }
}

/** 拉取文件 */
export async function fetchFile(link: string) {
    const config = readRules().config
    const url = replaceDevRequest(link)
    const opts = {
        headers: {
            referer: 'kmar-swpp',
            'User-Agent': 'kmar-swpp'
        },
        timeout: (config.external as any).timeout
    }
    try {
        if (typeof url === 'string') {
            return await fetch(url, opts)
        } else {
            return await fetchSpeed(url)
        }
    } catch (err) {
        // @ts-ignore
        if (err.type === 'request-timeout') {
            logger.error(
                `[SWPP FetchFile] 拉取文件 [${link}] 时出现了超时错误，如果您构建所在的位置无法访问该资源，` +
                "请尝试通过 DevReplace（https://kmar.top/posts/73014407/#4ea71e00）功能解决该问题。"
            )
            throw 'timeout'
        }
        throw err
    }
}

export function replaceDevRequest(link: string): string[] | string {
    const config = readRules().config
    if (typeof config.external === 'boolean') return link
    return config.external.replacer(link)
}

async function fetchSpeed(list: string[]) {
    const controllers: AbortController[] = new Array(list.length)
    const result = await Promise.any(
        list.map((it, index) => fetch(it, {
                signal: (controllers[index] = new AbortController()).signal
            }).then(response => [200, 301, 302, 307, 308].includes(response.status) ? {index, response} : Promise.reject())
        )
    )
    for (let i = 0; i < controllers.length; i++) {
        if (i !== result.index) controllers[i].abort()
    }
    return result.response
}