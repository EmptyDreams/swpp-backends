import {CompilationData, RuntimeData} from '../SwCompiler'

export type RuntimeSupplier<T> = (runtime: RuntimeData, compilation: CompilationData) => T

export class SpecialConfig {

    static isSpecialConfig(config: any): config is RuntimeSpecialConfig<any> {
        return config instanceof RuntimeSpecialConfig
    }

    static isIndivisibleConfig(config: any): config is IndivisibleConfig<any> | RuntimeSpecialConfig<any> {
        return config instanceof IndivisibleConfig || config instanceof RuntimeSpecialConfig
    }

    static isNoCacheConfig(config: any): config is NoCacheConfigGetter<any> {
        return config instanceof NoCacheConfigGetter
    }

}

/** 运行时特殊配置 */
export abstract class RuntimeSpecialConfig<T> extends SpecialConfig {

    abstract get(runtime: RuntimeData, compilation: CompilationData): T

}

/** 不可分割的配置 */
export class IndivisibleConfig<T> extends SpecialConfig {

    constructor(public readonly value: T) {
        super()
    }

}

/** 不被缓存的配置 */
export class NoCacheConfigGetter<T> extends RuntimeSpecialConfig<T> {

    constructor(private getter: RuntimeSupplier<T>) {
        super()
    }

    override get(runtime: RuntimeData, compilation: CompilationData): T {
        return this.getter(runtime, compilation)
    }

}

/** 延迟初始化配置 */
export class LazyInitConfig<T> extends RuntimeSpecialConfig<T> {

    private getter: RuntimeSupplier<T> | null
    private cache: T | undefined

    constructor(getter: RuntimeSupplier<T>) {
        super()
        this.getter = getter
    }

    override get(runtime: RuntimeData, compilation: CompilationData) {
        if (this.getter) {
            this.cache = this.getter(runtime, compilation)
            this.getter = null
        }
        return this.cache as T
    }

}