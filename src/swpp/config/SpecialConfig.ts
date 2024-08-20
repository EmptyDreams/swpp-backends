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

    constructor(public readonly value: T) {
        super()
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
export class LazyInitConfig<T> extends SpecialConfig implements RuntimeSpecialConfig<T> {

    private getter: RuntimeSupplier<T> | null
    private cache: T | undefined

    constructor(getter: RuntimeSupplier<T>) {
        super()
        this.getter = getter
    }

    get(runtime: RuntimeData, compilation: CompilationData) {
        if (this.getter) {
            this.cache = this.getter(runtime, compilation)
            this.getter = null
        }
        return this.cache as T
    }

}