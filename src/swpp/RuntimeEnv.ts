import {utils} from './untils'

export class RuntimeEnv {

    private runtimeEnvMap: { [p: string]: RuntimeEnvValue<any> } = {
        /** 缓存库名称 */
        CACHE_NAME: buildEnv({default: 'kmarBlogCache'}),
        /** 存储版本号的 URL */
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
        }),
        /** 逃生门版本号 */
        ESCAPE: buildEnv({default: 0}),
        /** 存储失效信息的头名称 */
        INVALID_KEY: buildEnv({
            default: 'X-Swpp-Invalid',
            checker(value) {
                if (!isLegalHeaderName(value)) {
                    return {value, message: '填写的 key 值是非法的 header 名称'}
                }
                return false
            }
        }),
        /** 存储入库时间的头名称 */
        STORAGE_TIMESTAMP: buildEnv({
            default: 'X-Swpp-Time',
            checker(value) {
                if (!isLegalHeaderName(value)) {
                    return {value, message: '填写的 key 值是非法的 header 名称'}
                }
                return false
            }
        }),
        /** 缓存规则 */
        matchCacheRule: buildEnv({
            default: (() => undefined) as (url: URL) => undefined | null | false | number
        })
    }

    /**
     * 读取环境变量的值
     * @throws RuntimeEnvException
     */
    read(key: string) {
        const item = this.runtimeEnvMap[key]
        if (!item) throw {key, message: 'key 不存在'}
        const value = item.getter?.() ?? item.default
        if (typeof value != typeof item.default)
            throw {key, value, message: '用户传入的值类型与缺省值类型不统一'} as RuntimeEnvException<any>
        const checkResult = item.checker?.(value)
        if (checkResult) throw {key, ...checkResult}
        return value
    }

    /**
     * 设置环境变量的值
     * @throws RuntimeEnvException
     */
    update(key: string, valueGetter: () => any) {
        const item = this.runtimeEnvMap[key]
        if (!item) throw {key, value: null, message: 'key 不存在'} as RuntimeEnvException<any>
        item.getter = valueGetter
    }

    /**
     * 追加环境变量
     * @throws RuntimeEnvException
     */
    append<T>(key: string, env: RuntimeEnvValue<T>) {
        if (key in this.runtimeEnvMap)
            throw {key, value: this.runtimeEnvMap[key], message: 'key 重复'}
        this.runtimeEnvMap[key] = env
    }

    /** 判断是否存在指定的环境变量 */
    has(key: string): boolean {
        return key in this.runtimeEnvMap
    }

    /** 获取所有键值对 */
    entries(): {[p: string]: any} {
        const result: {[p: string]: any} = {}
        for (let key in this.runtimeEnvMap) {
            result[key] = this.read(key)
        }
        return result
    }

}

function buildEnv<T>(env: RuntimeEnvValue<T>): RuntimeEnvValue<T> {
    return env
}

function isLegalHeaderName(name: string): boolean {
    return /^[a-zA-Z0-9-]+$/.test(name)
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