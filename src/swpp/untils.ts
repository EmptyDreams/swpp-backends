import {RuntimeEnvErrorTemplate} from './RuntimeEnv'

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
    }
}