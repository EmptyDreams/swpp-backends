const logger = require('hexo-log').default({
    debug: false,
    silent: false
})

/**
 * 获取 eject values
 * @param framework 框架对象
 * @param rules swpp rules 对象
 */
export function getEjectValues(framework: any, rules: any): { eject: string, nodeEject: any } | undefined {
    if (!('ejectValues' in rules)) return undefined
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
    return {
        eject: ejectStr,
        nodeEject
    }
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