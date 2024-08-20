export class SpecialConfig {

    static isIndivisibleConfig(config: any): config is IndivisibleConfig<any> {
        return config instanceof IndivisibleConfig
    }

    static isNoCacheConfig(config: any): config is NoCacheConfigGetter<any> {
        return config instanceof NoCacheConfigGetter
    }

}

/** 不可分割的配置 */
export class IndivisibleConfig<T> extends SpecialConfig {

    constructor(public readonly value: T) {
        super()
    }

}

/** 不被缓存的配置 */
export class NoCacheConfigGetter<T> extends IndivisibleConfig<() => T> {

    constructor(getter: () => T) {
        super(getter)
    }

    get(): T {
        return this.value()
    }

}