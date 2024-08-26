import {CompilationData, RuntimeData} from '../SwCompiler'
import {SwppConfigValueExp} from './ConfigCluster'

export type RuntimeSupplier<T> = (runtime: RuntimeData, compilation: CompilationData) => T

export class SpecialConfig<_T> {

    static isSpecialConfig(config: any): config is SpecialConfig<any> {
        return config instanceof SpecialConfig && !this.isRuntimeSpecialConfig(config)
    }
    
    static isRuntimeSpecialConfig(config: any): config is RuntimeSpecialConfig<any> {
        return config instanceof RuntimeSpecialConfig
    }

    static isIndivisibleConfig(config: any): config is IndivisibleConfig<any> | RuntimeSpecialConfig<any> {
        return config instanceof IndivisibleConfig || config instanceof RuntimeSpecialConfig
    }

    static isNoCacheConfig(config: any): config is NoCacheConfig<any> {
        return config instanceof NoCacheConfig
    }

    static isContextConfig(config: any): config is ContextConfig<any> {
        return config instanceof ContextConfig
    }

}

/** 运行时特殊配置 */
export abstract class RuntimeSpecialConfig<T> extends SpecialConfig<T> {

    abstract get(runtime: RuntimeData, compilation: CompilationData): T

}

/** 不可分割的配置 */
export class IndivisibleConfig<T> extends SpecialConfig<T> {

    constructor(public readonly value: T) {
        super()
    }

}

/** 区分开发环境和生产环境的配置项 */
export class ContextConfig<T> extends SpecialConfig<SwppConfigValueExp<T>> {

    constructor(public readonly dev: SwppConfigValueExp<T>, public readonly prod: SwppConfigValueExp<T>) {
        super()
    }

}

/** 不被缓存的配置 */
export class NoCacheConfig<T> extends RuntimeSpecialConfig<T> {

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