import {RuntimeEnvErrorTemplate} from './RuntimeEnv'

export type ValuesOf<T> = T[keyof T]

export const utils = {

    /** 将一个值封装为 lambda */
    package<T>(value: T): () => T {
        return () => value
    },

    /** 检查类型是否匹配 */
    checkType<T>(value: T, type: string, defaultValue: T): false|RuntimeEnvErrorTemplate<T> {
        return (typeof value) == type ? false : {
            value,
            message: `类型错误，需要类型“${type}”`
        }
    },

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
                    if (text.startsWith('function ')) { // function ${key}(xxx) { xxx }
                        if (writeAsVar) {
                            resultList.push(text)
                        } else {
                            resultList.push(text.substring(9).trimStart())
                        }
                    } else if (/^[a-zA-Z0-9_$]+\s*\(/.test(text)) { // ${key}(xxx) { xxx }
                        if (writeAsVar) {
                            resultList.push('function ' + text)
                        } else {
                            resultList.push(text)
                        }
                    } else {    // (xxx) => {}
                        console.assert(text.includes('=>'))
                        pushToResult(key, text)
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
    }

}

export const exceptionNames = {
    invalidVarName: 'invalid_var_name',
    invalidVarType: 'invalid_var_type'
} as const

export interface RuntimeException {

    /** 报错类型代码 */
    code: ValuesOf<typeof exceptionNames>
    /** 错误提示 */
    message: string

}