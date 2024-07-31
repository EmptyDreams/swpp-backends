/** 键值对存储器 */
export class KeyValueDatabase<T, C extends Record<string, DatabaseValue<T>>> {

    private runtimeEnvMap: { [p: string]: DatabaseValue<T> } = {}

    constructor(map?: C) {
        if (map) {
            Object.assign(this.runtimeEnvMap, map)
        }
    }

    /** 延迟初始化 */
    protected lazyInit(map: C) {
        Object.assign(this.runtimeEnvMap, map)
    }

    /**
     * 读取指定键对应的值
     * @throws RuntimeEnvException
     */
    read<K extends keyof C | string>(key: K): K extends keyof C ? C[K]['default'] : T {
        const item = this.runtimeEnvMap[key as string]
        if (!item) throw {key, message: 'key 不存在'}
        const value = item.getter ? item.getter() : item.default
        if (!(value === null || value === undefined) && typeof value != typeof item.default)
            throw {key, value, message: '用户传入的值类型与缺省值类型不统一'} as RuntimeEnvException<any>
        const checkResult = item.checker?.(value)
        if (checkResult) throw {key, ...checkResult}
        return value as any
    }

    /**
     * 设置指定键对应的值
     * @throws RuntimeEnvException
     */
    update<K extends keyof C | string>(key: K, valueGetter: () => T) {
        if (!(key in this.runtimeEnvMap))
            throw {key, value: null, message: 'key 不存在'} as RuntimeEnvException<any>
        this.runtimeEnvMap[key as string].getter = valueGetter
    }

    /**
     * 追加键值对
     * @throws RuntimeEnvException
     */
    append(key: string, env: DatabaseValue<T>) {
        if (key in this.runtimeEnvMap)
            throw {key, value: this.runtimeEnvMap[key], message: 'key 重复'}
        this.runtimeEnvMap[key] = env
    }

    /** 判断是否存在指定的环境变量 */
    hasKey<K extends keyof C | string>(key: K): (K extends keyof C ? true : boolean) {
        // @ts-ignore
        return key in this.runtimeEnvMap
    }

    /** 判断指定键对应的环境变量是否存在用户设置的值 */
    hasValue<K extends keyof C | string>(key: K): boolean {
        return this.hasKey(key) && !!this.runtimeEnvMap[key as string].getter
    }

    /** 获取所有键值对 */
    entries(): {[p: string]: T} {
        const result: {[p: string]: any} = {}
        for (let key in this.runtimeEnvMap) {
            result[key] = this.read(key)
        }
        return result
    }

}

/**
 * 为优化 IDE 的类型推断提供的函数，直接返回传入的值
 * @param env
 */
export function buildEnv<T>(env: DatabaseValue<T>): DatabaseValue<T> {
    return env
}

export interface DatabaseValue<T> {

    /** 缺省值 */
    default: T
    /** 用户填入的值 */
    getter?: () => T
    /** 检查器，返回 false 表示无错误 */
    checker?: (value: T) => false | RuntimeEnvErrorTemplate<T>

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