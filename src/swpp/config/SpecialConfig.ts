import {CompilationData, RuntimeData} from '../SwCompiler'

export type RuntimeSupplier<T> = (runtime: RuntimeData, compilation: CompilationData) => T

export class SpecialConfig {

    static isSpecialConfig(config: any): config is RuntimeSpecialConfig<any> & SpecialConfig {
        return config instanceof SpecialConfig
    }

    static isIndivisibleConfig(config: any): config is IndivisibleConfig<any> {
        return config instanceof IndivisibleConfig
    }

    static isNoCacheConfig(config: any): config is NoCacheConfigGetter<any> {
        return config instanceof NoCacheConfigGetter
    }

}

/** 运行时特殊配置 */
export interface RuntimeSpecialConfig<T> {

    get(runtime: RuntimeData, compilation: CompilationData): T

}

/** 不可分割的配置 */
export class IndivisibleConfig<T> extends SpecialConfig {

    constructor(private _value: T) {
        super()
    }

    get value(): T {
        return this._value
    }

    protected set value(value: T) {
        this._value = value
    }

}

/** 不被缓存的配置 */
export class NoCacheConfigGetter<T> extends IndivisibleConfig<RuntimeSupplier<T>> implements RuntimeSpecialConfig<T> {

    constructor(getter: RuntimeSupplier<T>) {
        super(getter)
    }

    get(runtime: RuntimeData, compilation: CompilationData): T {
        return this.value(runtime, compilation)
    }

}

/** 延迟初始化配置 */
export class LazyInitConfig<T> extends IndivisibleConfig<RuntimeSupplier<T> | null> implements RuntimeSpecialConfig<T> {

    private cache: T | undefined

    constructor(getter: RuntimeSupplier<T>) {
        super(getter)
    }

    get(runtime: RuntimeData, compilation: CompilationData) {
        if (this.value) {
            this.cache = this.value(runtime, compilation)
            this.value = null
        }
        return this.cache as T
    }

}