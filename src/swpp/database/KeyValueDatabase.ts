/** 键值对存储器 */
export class KeyValueDatabase<T, CONTAINER extends Record<string, DatabaseValue<T>>> {

    private dataValues: Record<string, DatabaseValue<T>> = {}
    private valueCaches: Record<string, T> = {}

    constructor(map?: CONTAINER) {
        if (map) {
            Object.assign(this.dataValues, map)
        }
    }

    /** 延迟初始化 */
    protected lazyInit(map: CONTAINER) {
        Object.assign(this.dataValues, map)
    }

    /**
     * 读取指定键对应的值。
     *
     * 注意：允许被缓存的值返回后是不允许被修改的，不缓存的值是允许修改的。
     */
    read<K extends keyof CONTAINER | string>(_key: K): K extends keyof CONTAINER ? CONTAINER[K]['default'] : T {
        const key = _key as string
        if (key in this.valueCaches) {
            return this.valueCaches[key] as any
        }
        const item = this.dataValues[key]
        if (!item) throw {key, message: 'key 不存在'}
        let value = item.getter ? item.getter() : item.default
        if (!(value === null || value === undefined) && typeof value != typeof item.default)
            throw {key, value, message: '用户传入的值类型与缺省值类型不统一'} as RuntimeEnvException<any>
        const checkResult = item.checker?.(value)
        if (checkResult) throw {key, ...checkResult}
        if (item.getter) {
            const getter = item.getter
            if ('1NoCache' in getter && getter['1NoCache'])
                return value as any
        }
        return this.valueCaches[key] = value as any
    }

    /** 读取默认配置 */
    readDefault<K extends keyof CONTAINER | string>(_key: K): K extends keyof CONTAINER ? CONTAINER[K]['default'] : T {
        const key = _key as string
        const item = this.dataValues[key]
        if (!item) throw {key, message: 'key 不存在'}
        return item.default as any
    }

    /**
     * 设置指定键对应的值
     * @throws RuntimeEnvException
     */
    update<K extends keyof CONTAINER | string>(key: K, valueGetter: () => T) {
        if (!(key in this.dataValues))
            throw {key, value: null, message: 'key 不存在'} as RuntimeEnvException<any>
        this.dataValues[key as string].getter = valueGetter
        delete this.valueCaches[key as string]
    }

    /**
     * 追加键值对
     * @throws RuntimeEnvException
     */
    append(key: string, env: DatabaseValue<T>) {
        if (key in this.dataValues)
            throw {key, value: this.dataValues[key], message: 'key 重复'}
        this.dataValues[key] = env
    }

    /** 判断是否存在指定的环境变量 */
    hasKey<K extends keyof CONTAINER | string>(key: K): (K extends keyof CONTAINER ? true : boolean) {
        // @ts-ignore
        return key in this.dataValues
    }

    /** 判断指定键对应的环境变量是否存在用户设置的值 */
    hasValue<K extends keyof CONTAINER | string>(key: K): boolean {
        return this.hasKey(key) && !!this.dataValues[key as string].getter
    }

    /** 获取所有键值对 */
    entries(): Record<string, T> {
        const result: Record<string, any> = {}
        for (let key in this.dataValues) {
            result[key] = this.read(key)
        }
        return result
    }

    // noinspection JSUnusedGlobalSymbols
    /** 定义一个不被缓存的 getter */
    static defineNoCacheGetter<T>(getter: () => T): NoCacheGetter<T> {
        const result = getter as NoCacheGetter<T>
        Object.defineProperty(result, '1NoCache', {
            value: true,
            writable: false,
            configurable: false,
            enumerable: false
        })
        return result
    }

}

export interface NoCacheGetter<T> extends Function {

    '1NoCache': true

    (): T

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