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

    get(): T

}

/** 不可分割的配置 */
export class IndivisibleConfig<T> extends SpecialConfig {

    constructor(public readonly value: T) {
        super()
    }

}

/** 不被缓存的配置 */
export class NoCacheConfigGetter<T> extends IndivisibleConfig<() => T> implements  RuntimeSpecialConfig<T> {

    constructor(getter: () => T) {
        super(getter)
    }

    get(): T {
        return this.value()
    }

}