import {utils} from './untils'

export const runtimeEnv = {

    /**
     * 读取环境变量的值
     * @throws RuntimeEnvException
     */
    read(key: string) {
        const item = runtimeEnvMap[key]
        if (!item) throw {key, message: 'key 不存在'}
        const value = item.getter?.() ?? item.default
        if (typeof value != typeof item.default)
            throw {key, value, message: '用户传入的值类型与缺省值类型不统一'} as RuntimeEnvException<any>
        const checkResult = item.checker?.(value)
        if (checkResult) throw {key, ...checkResult}
        return value
    },

    /**
     * 设置环境变量的值
     * @throws RuntimeEnvException
     */
    update(key: string, valueGetter: () => any) {
        const item = runtimeEnvMap[key]
        if (!item) throw {key, value: null, message: 'key 不存在'} as RuntimeEnvException<any>
        item.getter = valueGetter
    },

    /**
     * 追加环境变量
     * @throws RuntimeEnvException
     */
    append<T>(key: string, env: RuntimeEnvValue<T>) {
        if (key in runtimeEnvMap)
            throw {key, value: runtimeEnvMap[key], message: 'key 重复'}
        runtimeEnvMap[key] = env
    },

    /** 遍历所有环境变量的键 */
    forEachKeys(consumer: (key: string) => void) {
        for (let key in runtimeEnvMap) {
            consumer(key)
        }
    }

}

/** 环境变量 */
const runtimeEnvMap: { [p: string]: RuntimeEnvValue<any> } = {
    CACHE_NAME: buildEnv({
        default: 'kmarBlogCache'
    }),
    VERSION_PATH: buildEnv({
        default: 'https://id.v3/',
        checker(value) {
            if (!utils.checkUrl(value)) {
                return {value, message: '填写的 URL 不合法'}
            }
            if (!value.endsWith('/')) {
                return {value, message: '填写的 URL 应当以“/”结尾'}
            }
            return false
        }
    })
}

function buildEnv<T>(env: RuntimeEnvValue<T>): RuntimeEnvValue<T> {
    return env
}

/** 运行时环境变量包含非法值时的警告 */
export interface RuntimeEnvException<T> {

    /** 环境变量名 */
    key: string
    /** 用户填写的值 */
    value: T
    /** 错误提示 */
    message: string

}

export type RuntimeEnvErrorTemplate<T> = Omit<RuntimeEnvException<T>, 'key'>

export interface RuntimeEnvValue<T> {

    /** 缺省值 */
    default: T
    /** 用户填入的值 */
    getter?: () => T
    /** 检查器，返回 false 表示无错误 */
    checker?: (value: T) => false | RuntimeEnvErrorTemplate<T>

}