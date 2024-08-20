import {NoCacheConfigGetter, RuntimeSpecialConfig, SpecialConfig} from '../config/SpecialConfig'
import {exceptionNames, RuntimeException} from '../untils'

/** 键值对存储器 */
export class KeyValueDatabase<T, CONTAINER extends Record<string, DatabaseValue<T>>> {

    private dataValues: Record<string, DatabaseValue<T>> = {}
    private valueCaches: Record<string, T> = {}

    /**
     * @param map 默认值
     * @param globalChecker 全局检查器（优先于每个属性设置的 checker 执行），遇到问题直接抛出异常
     */
    constructor(map?: CONTAINER, private readonly globalChecker?: (key: string, value: T) => void) {
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
    read<K extends keyof CONTAINER | string>(_key: K): K extends keyof CONTAINER ? Exclude<CONTAINER[K]['default'], RuntimeSpecialConfig<any>> : T {
        const key = _key as string
        if (key in this.valueCaches) {
            return this.valueCaches[key] as any
        }
        const item = this.dataValues[key]
        if (!item) throw new RuntimeException(exceptionNames.invalidKey, `输入的 key[${key}] 不存在`)
        // 获取真实值
        let value: any = item.default
        let isNoCache = false
        if (item.getter) {
            if (SpecialConfig.isSpecialConfig(item.getter)) {
                value = item.getter.get()
                if (SpecialConfig.isNoCacheConfig(item.getter)) {
                    isNoCache = true
                }
            } else {
                value = item.getter()
            }
        }
        // 进行类型预检
        if (!(value === null || value === undefined) && typeof value != typeof item.default) {
            throw new RuntimeException(
                exceptionNames.invalidValue,
                '用户传入的值类型与缺省值类型不统一',
                { default: item.default, value }
            )
        }
        // 执行全局检查
        this.globalChecker?.(key, value)
        // 执行用户数据检查
        const checkResult = item.checker?.(value)
        if (checkResult) {
            throw new RuntimeException(exceptionNames.invalidValue, `设置的值非法`, {key, ...checkResult})
        }
        // 如果不需要缓存直接返回，否则存入缓存后返回
        if (isNoCache) return value as any
        return this.valueCaches[key] = value as any
    }

    /** 读取默认配置 */
    readDefault<K extends keyof CONTAINER | string>(_key: K): K extends keyof CONTAINER ? CONTAINER[K]['default'] : T {
        const key = _key as string
        const item = this.dataValues[key]
        if (!item) throw new RuntimeException(exceptionNames.invalidKey, `传入的 key[${key}] 不存在`)
        return item.default as any
    }

    /**
     * 设置指定键对应的值
     */
    update<K extends keyof CONTAINER | string>(key: K, valueGetter: (() => T) | NoCacheConfigGetter<T>) {
        if (!(key in this.dataValues))
            throw new RuntimeException(exceptionNames.invalidKey, `传入的 key[${key as string}] 不存在`)
        this.dataValues[key as string].getter = valueGetter
        delete this.valueCaches[key as string]
    }

    /**
     * 追加键值对
     */
    append(key: string, env: DatabaseValue<T>) {
        if (key in this.dataValues)
            throw new RuntimeException(exceptionNames.invalidKey, `追加的 key[${key}] 已存在`)
        if ('getter' in env)
            throw new RuntimeException(exceptionNames.invalidValue, `追加的属性中不应当包含 getter 字段`)
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

    /** 冻结 KV 库，冻结后无法再添加和修改内容 */
    freeze() {
        if (Object.isFrozen(this.dataValues)) return
        this.dataValues = Object.freeze(new Proxy(this.dataValues, {
            set(): boolean {
                throw new RuntimeException(exceptionNames.isFrozen, 'KV 库已经被冻结无法修改')
            },
            setPrototypeOf(): boolean {
                throw new RuntimeException(exceptionNames.isFrozen, 'KV 库已经被冻结无法修改')
            },
            deleteProperty(): boolean {
                throw new RuntimeException(exceptionNames.isFrozen, 'KV 库已经被冻结无法修改')
            },
            defineProperty(): boolean {
                throw new RuntimeException(exceptionNames.isFrozen, 'KV 库已经被冻结无法修改')
            }
        }))
    }

}

/**
 * 为优化 IDE 的类型推断提供的函数，直接返回传入的值
 * @param env
 */
export function buildEnv<T>(env: DatabaseValue<T>): DatabaseValue<T> {
    return env
}

// /**
//  * 读取指定对象中的指定字段。
//  *
//  * 由于配置文件中允许同时写入 T 或 `NoCacheConfigGetter<T>`，当在配置项中使用 `this` 时，需要先判定 `this` 是哪一个类型
//  */
// export function readThisValue<
//     T extends NoCacheConfigGetter<object> | object,
//     K extends keyof (T extends NoCacheConfigGetter<any> ? ReturnType<T['get']> : T)
//     // @ts-ignore
// >(obj: T, key: K): T extends NoCacheConfigGetter<any> ? ReturnType<T['get']>[K] : T[K] {
//     return SpecialConfig.isNoCacheConfig(obj) ? obj.get()[key] : (obj as any)[key]
// }

export interface DatabaseValue<T> {

    /** 缺省值 */
    default: T | RuntimeSpecialConfig<T>

    /** 用户填入的值 */
    getter?: (() => T) | RuntimeSpecialConfig<T>

    /** 检查器，返回 false 表示无错误 */
    checker?: (value: T) => false | RuntimeEnvErrorTemplate<T>

}

export interface RuntimeEnvErrorTemplate<T> {

    value: T
    message: string

}