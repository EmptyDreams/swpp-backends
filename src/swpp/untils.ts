import * as crypto from 'node:crypto'
import {RuntimeEnvErrorTemplate} from './database/KeyValueDatabase'

export type ValuesOf<T> = T[keyof T]

export const utils = {

    /** 检查指定 URL 是否是合法的 URL */
    checkUrl(url: string): boolean {
        try {
            new URL(url)
            return true
        } catch (e) {
            return false
        }
    },

    /**
     * 拼接链接
     */
    splicingUrl(base: URL, ...values: string[]): URL {
        return new URL(values.join('/').replaceAll(/(\/+)|\\/g, '/'), base)
    },

    /**
     * 将任意的对象转化为 JS 源码
     *
     * @param obj 要进行转化的对象
     * @param includeEmptyValue 是否包含空的值，当为 false 时将不在源码中写入值为 null 和 undefined 的内容
     * @param writeAsVar 以变量形式写入时填入值，当存在非法变量名是会报错
     * @return 返回 JS 源代码，注意：该函数不保证导出的代码的美观度，也不保证字符串的引号一定使用某一种引号
     * @throws RuntimeException 若 {@link writeAsVar} 启用且 {@link obj} 中存在非法变量名 / {code = "invalid_var_name"}
     * @throws RuntimeException 若 {@link obj} 中包含 symbol 类型 / {code = "invalid_var_type"}
     *
     * @example <caption>基础示例</caption>
     * // "{hello: 'world'}"
     * anyToSource({hello: 'world', empty: null})
     * @example <caption>includeEmptyValue 示例</caption>
     * // "{hello: 'world', empty: null}"
     * anyToSource({hello: 'world', empty: null}, true)
     * @example <caption>writeAsVar 示例</caption>
     * // """
     * // const hello = 'world';
     * // const code = 'js';
     * // """
     * anyToSource({hello: 'world', code: 'js'}, false, 'const')
     * @example <caption>特殊情况</caption>
     * anyToSource({empty: null})               // "{}"
     * anyToSource({empty: null}, false, 'let') // ""
     * anyToSource(null)                        // ""
     */
    anyToSource(obj: {[p: string]: any}, includeEmptyValue: boolean = false, writeAsVar?: 'let' | 'const'): string {
        if (!obj) return ''
        const resultList: string[] = []
        const pushToResult = (key: string, value: string) => {
            if (writeAsVar) {
                if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(key))
                    throw {
                        code: exceptionNames.invalidVarName,
                        message: '非法的变量名：' + key
                    } as RuntimeException
                resultList.push(`${writeAsVar} ${key} = ${value}`)
            } else if (/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(key)) {
                resultList.push(`${key}: ${value}`)
            } else {
                resultList.push(`'${key}': ${value}`)
            }
        }
        for (let key in obj) {
            const value = obj[key]
            if ((value === null || value === undefined) && !includeEmptyValue) continue
            switch (typeof value) {
                case "undefined":
                    pushToResult(key, 'undefined')
                    break
                case "object":
                    if (!value) pushToResult(key, 'null')
                    else {
                        const valueStr = this.anyToSource(value, includeEmptyValue)
                        pushToResult(key, valueStr)
                    }
                    break
                case "boolean": case "number":
                    pushToResult(key, value.toString())
                    break
                case "string":
                    pushToResult(key, "'" + value.replaceAll("'", "\\'") + "'")
                    break
                case "bigint":
                    pushToResult(key, value.toString() + 'n')
                    break
                case "function": {
                    const text: string = value.toString()
                    if (text.startsWith('function ') || text.startsWith('async function ')) { // function ${key}(xxx) { xxx }
                        if (writeAsVar) {
                            resultList.push(text)
                        } else {
                            resultList.push(text.substring(9).trimStart())
                        }
                    } else {
                        const firstIndex = text.indexOf('{')
                        const startIndex = text.indexOf('=>')
                        if (startIndex > 0 && (firstIndex < 0 || startIndex < firstIndex)) {
                            // (xxx) => {}
                            pushToResult(key, text)
                        } else {
                            if (writeAsVar) {
                                resultList.push('function ' + text)
                            } else {
                                resultList.push(text)
                            }
                        }
                    }
                    break
                }
                case "symbol":
                    throw {
                        code: exceptionNames.invalidVarType,
                        message: '非法的类型：symbol, key = ' + key
                    } as RuntimeException
            }
        }
        return writeAsVar ? resultList.join(';\n') : '{\n' + resultList.join(',\n') + '\n};'
    },

    /** 判断指定链接的 host 是否为指定的 host */
    isSameHost(path: string, baseUrl: URL): boolean {
        try {
            const url = new URL(path, baseUrl)
            return baseUrl.hostname === url.hostname && baseUrl.pathname.startsWith(url.pathname)
        } catch (_) {
            throw {
                value: `path: ${path}; host: ${baseUrl}`,
                message: '传入的 path 或 host 不合法'
            } as RuntimeEnvErrorTemplate<string>
        }
    },

    /** 计算字符串的哈希值 */
    calcHash(content: crypto.BinaryLike): string {
        const hash = crypto.createHash('md5')
        hash.update(content)
        return hash.digest('hex')
    },

    time(): string {
        const now = new Date()
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        return `${hours}:${minutes}:${seconds}`
    },

    printError(title: string, err: any) {
        console.error(`[${this.time()}] [ERR] [SWPP] [${title}]: `, err)
    },

    printWarning(title: string, warning: any) {
        console.warn(`[${this.time()}] [WARN] [SWPP] [${title}]: ${JSON.stringify(warning, null, 2)}`)
    },

    /**
     * 将一个对象中的值都映射为另一个类型的值
     * @param obj
     * @param transfer
     */
    objMap<T, R>(obj: Readonly<Record<string, T>>, transfer: (item: T) => R): { [key: string]: R } {
        const result: any = {}
        for (let key in obj) {
            const value = obj[key]
            result[key] = transfer(value)
        }
        return result
    },

    /**
     * 在可迭代容器中查找满足指定条件的元素的下标
     */
    findValueInIterable<T>(set: Iterable<T>, predicate: (item: T) => boolean): { index: number, value: T }[] {
        const result = []
        let index = 0
        for (let item of set) {
            if (predicate(item)) result.push({index, value: item})
            ++index
        }
        return result
    }

}

export const exceptionNames = {
    /** 无效的变量名 */
    invalidVarName: 'invalid_var_name',
    /** 无效的变量类型 */
    invalidVarType: 'invalid_var_type',
    /** 无效的插入键 */
    invalidKey: 'invalid_key',
    /** 无效的插入值 */
    invalidValue: 'invalid_value',
    /** 不支持的版本号 */
    unsupportedVersion: 'unsupported_version',
    /** 不支持的文件类型 */
    unsupportedFileType: 'unsupported_file_type',
    /** 不支持的操作 */
    unsupportedOperate: 'unsupported_operate',
    /** 空指针 */
    nullPoint: 'null_point',
    /** 配置文件已经完成构建 */
    configBuilt: 'config_built',
    /** 404 错误 */
    notFound: 'not_found',
    /** 未知分类错误 */
    error: 'error'
} as const

export interface RuntimeException {

    /** 报错类型代码 */
    code: ValuesOf<typeof exceptionNames>
    /** 错误提示 */
    message: string

}