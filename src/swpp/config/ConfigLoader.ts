import { createJiti } from 'jiti'
import nodePath from 'path'
import {COMMON_TYPE_COMP_ENV} from '../database/CompilationEnv'
import {COMMON_TYPE_CROSS_DEP} from '../database/CrossDepCode'
import {COMMON_TYPE_CROSS_ENV} from '../database/CrossEnv'
import {COMMON_TYPE_RUNTIME_CORE} from '../database/RuntimeCoreCode'
import {COMMON_KEY_RUNTIME_DEP, FunctionInBrowser} from '../database/RuntimeDepCode'
import {COMMON_TYPE_RUNTIME_EVENT} from '../database/RuntimeEventCode'
import {CompilationData, RuntimeData} from '../SwCompiler'
import {exceptionNames, RuntimeException} from '../untils'

export class ConfigLoader {

    /** 支持的拓展名列表 */
    private static readonly extensions: ReadonlyArray<string> = [
        'js', 'ts', 'cjs', 'cts', 'mjs', 'mjs'
    ]

    private static jiti = createJiti(__filename, {
        fsCache: false,
        moduleCache: false
    })

    private config: SwppConfigTemplate | undefined
    private isBuilt = false

    /**
     * 加载一个配置文件，越早加载的优先级越高
     * @param file
     */
    async load(file: string) {
        if (this.isBuilt) throw {
            code: exceptionNames.configBuilt,
            message: '配置文件已经完成构建，不能继续加载新的配置',
            file
        } as RuntimeException
        const extensionName = nodePath.extname(file)
        if (!ConfigLoader.extensions.includes(extensionName)) {
            throw {
                code: exceptionNames.unsupportedFileType,
                message: `配置文件传入了不支持的文件类型：${extensionName}，仅支持：${ConfigLoader.extensions}`,
                file
            } as RuntimeException
        }
        // @ts-ignore
        const content: any = await ConfigLoader.jiti.import(file)
        let newConfig: SwppConfigTemplate = 'default' in content ? content.default : content
        if (this.config) this.mergeConfig(newConfig)
        else this.config = newConfig
    }

    /** 将配置项的内容写入到环境中 */
    write(runtime: RuntimeData, compilation: CompilationData) {
        if (!this.config) throw {
            code: exceptionNames.nullPoint,
            message: '构建配之前必须至少加载一个配置文件'
        } as RuntimeException
        const config = this.config!
        // 写入运行时信息
        const writeRuntime = () => {
            const insertList = ['runtimeDep', 'runtimeCore', 'runtimeEvent']
            for (let str of insertList) {
                const configValue = config[str as keyof SwppConfigTemplate]
                if (!configValue) continue
                for (let key in configValue) {
                    const value = configValue[key]
                    runtime.runtimeDep.update(key, () => value ?? null)
                }
            }
        }
        // 写入编译期信息
        const writeCompilation = () => {
            if (!config.compilationEnv) throw {
                code: exceptionNames.nullPoint,
                message: '配置项必须包含 compilationEnv 选项！'
            } as RuntimeException
            for (let key in config.compilationEnv) {
                const value = config.compilationEnv[key]
                compilation.compilationEnv.update(key, () => value)
            }
        }
        // 写入 cross
        const writeCross = () => {
            if (config.crossEnv) {
                for (let key in config.crossEnv) {
                    const env = config.crossEnv[key]
                    const value = typeof env === 'function' ? env.call(compilation) : env
                    if (typeof value === 'function') throw {
                        code: exceptionNames.invalidVarType,
                        message: `crossEnv[${key}] 应当返回一个非函数对象，却返回了：${value.toString()}`
                    }
                    runtime.crossEnv.update(key, () => value)
                }
            }
            if (config.crossDep) {
                for (let key in config.crossDep) {
                    const value = config.crossDep[key]
                    if (typeof value != 'object') throw {
                        code: exceptionNames.invalidVarType,
                        message: `crossDep[${key}] 返回的内容应当为一个对象，却返回了：${value}`
                    }
                    if (!('runOnNode' in value)) throw {
                        code: exceptionNames.invalidVarType,
                        message: `crossDep[${key}] 返回的对象应当包含 {runOnNode} 字段，却返回了：${JSON.stringify(value, null, 2)}`
                    }
                    if (!('runOnBrowser' in value)) throw {
                        code: exceptionNames.invalidVarType,
                        message: `crossDep[${key}] 返回的对象应当包含 {runOnBrowser} 字段，却返回了：${JSON.stringify(value, null, 2)}`
                    }
                    runtime.crossDep.update(key, () => value)
                }
            }
        }
        writeRuntime()
        writeCompilation()
        writeCross()
    }

    /** 将新配置合并到已有配置中 */
    private mergeConfig(other: SwppConfigTemplate) {
        function mergeHelper(high: any, low: any) {
            for (let key in low) {
                const lowValue = low[key]
                if (key in high) {
                    const highValue = high[key]
                    if (highValue === undefined) {
                        high[key] = lowValue
                        continue
                    }
                    if (typeof highValue != typeof lowValue) continue
                    if (typeof highValue == 'object') {
                        mergeHelper(highValue, lowValue)
                    }
                } else {
                    high[key] = lowValue
                }
            }
        }
        mergeHelper(this.config, other)
    }

}

/** 定义一个通过 `export default` 导出的配置 */
export function defineConfig(config: SwppConfigTemplate): SwppConfigTemplate {
    return config
}

/** 定义一个通过 `export const compilationEnv` 导出的配置 */
export function defineCompilationEnv(config: SwppConfigCompilationEnv): SwppConfigCompilationEnv {
    return config
}

/** 定义一个通过 `export const crossEnv` 导出的配置 */
export function defineCrossEnv(config: SwppConfigCrossEnv): SwppConfigCrossDep {
    return config
}

/** 定义一个通过 `export const runtimeDep` 导出的配置 */
export function defineRuntimeDep(config: SwppConfigRuntimeDep): SwppConfigRuntimeDep {
    return config
}

/** 定义一个通过 `export const crossDep` 导出的配置 */
export function defineCrossDep(config: SwppConfigCrossDep): SwppConfigCrossDep {
    return config
}

/** 定义一个通过 `export const runtimeCore` 导出的配置 */
export function defineRuntimeCore(config: SwppConfigRuntimeCore): SwppConfigRuntimeCore {
    return config
}

/** 定义一个通过 `export const runtimeEvent` 导出的配置 */
export function defineRuntimeEvent(config: SwppConfigRuntimeEvent): SwppConfigRuntimeEvent {
    return config
}

type ValueOrReturnValue<T> = T | ((this: CompilationData) => T)

/**
 * SWPP 配置模板
 * 
 * 如果配置文件是 TS 编写的，配置文件的所有内容均可放心使用 TS 进行编写，SWPP 会将 TS 代码转换为 JS 再插入到 sw.js 中
 */
export interface SwppConfigTemplate {

    /** @see {SwppConfigCompilationEnv} */
    compilationEnv: SwppConfigCompilationEnv

    /** @see {SwppConfigCrossEnv} */
    crossEnv: SwppConfigCrossEnv

    /** @see {SwppConfigRuntimeDep} */
    runtimeDep: SwppConfigRuntimeDep

    /** @see {SwppConfigCrossDep} */
    crossDep: SwppConfigCrossDep

    /** @see {SwppConfigRuntimeCore} */
    runtimeCore: SwppConfigRuntimeCore

    /** @see {SwppConfigRuntimeEvent} */
    runtimeEvent: SwppConfigRuntimeEvent

}

/**
 * 运行时函数依赖。
 *
 * 该配置项用于放置所有仅在浏览器 SW 环境下执行的工具函数。
 *
 * 对于每一项配置 `<KEY>: <function>`：<KEY> 是函数名（推荐使用小写驼峰式命名），<function> 是函数体。
 *
 * 如果函数体中需要使用其它运行时的环境变量、函数依赖等内容，直接调用即可，
 * 如果需要避免 IDE 报错/警告，可以在配置文件中声明一些不导出的变量，以此假装上下文中存在该函数。
 * TS 还可以使用 `@ts-ignore` 忽略相关的错误。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * // 该代码将在 sw.js 中创建一系列函数：
 * // const example = () => console.log('hello')
 * // function invokeExample() { example() }
 * runtimeDep: {
 *     example: () => console.log('hello'),
 *     invokeExample: function() { example() }
 * }
 * // 如果为了避免 IDE 报错，还可以在文件任意一个位置编写类似的代码：
 * // let example: () => void       good
 * // type example = () => void     good
 * // let example = any             不推荐，因为丢失了类型，会影响 IDE 的自动补全和静态类型推断
 * // 或者直接在函数调用的位置使用 @ts-ignore 也可以避免报错，同样不推荐，理由同上
 * ```
 */
export type SwppConfigRuntimeDep = {
    [K in keyof COMMON_KEY_RUNTIME_DEP | string]?: K extends keyof COMMON_KEY_RUNTIME_DEP ? COMMON_KEY_RUNTIME_DEP[K]['default'] : FunctionInBrowser<any[], any>
}

/**
 * 运行时核心功能.
 *
 * 该配置项用于放置所有核心功能函数，用法与 {@link SwppConfigRuntimeDep} 相同。
 *
 * 该配置项与 RuntimeDep 不同的是两者的定位，RuntimeDep 中主要放置一些简单的工具函数，而 RuntimeCore 则放置一些核心代码。
 * 默认情况下，RuntimeCore 也将被插入到 RuntimeDep 的后面，在一些特殊情况下可以避免一些声明顺序导致的问题。
 */
export type SwppConfigRuntimeCore = {
    [K in keyof COMMON_TYPE_RUNTIME_CORE | string]?: K extends keyof COMMON_TYPE_RUNTIME_CORE ? COMMON_TYPE_RUNTIME_CORE[K]['default'] : FunctionInBrowser<any[], any>
}

/**
 * 运行时 & 编译期的函数依赖。
 *
 * 该配置项用于放置所有同时在浏览器和 NodeJs 环境下执行的工具函数。
 *
 * 对于每一项配置 `<KEY>: { <runOnBrowser>, <runOnNode> }`：<KEY> 是函数名，
 * <runOnBrowser> 是在浏览器环境下执行的代码，<runOnNode> 是在 NodeJs 环境下执行的代码。
 *
 * 对于在浏览器环境下执行的代码，可以像 {@link SwppConfigRuntimeDep} 一样引用其它运行时的环境变量、依赖函数等内容。
 *
 * 对于在 NodeJs 环境下执行的代码，可以使用 `this` 调用 <runOnBrowser>（前提是 <runOnBrowser> 中没有依赖浏览器环境的代码）。
 *
 * <runOnBrowser> 和 <runOnNode> 中的代码的行为应当完全一致。注意：此处说的行为一致是两者应当产生相同的副作用，内部具体实现可以不一样。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * crossDep: {
 *     example: {   // 不推荐！双端的行为不完全一致！但如果是为了进行代码测试，可以临时这么干。
 *         runOnBrowser: () => console.log('hello'),
 *         runOnNode: () => console.log('world')
 *     },
 *     invokeExample: {
 *         runOnBrowser: () => console.log('hello world'),
 *         runOnNode() {
 *             this.runOnBrowser()
 *         }
 *     }
 * }
 * ```
 */
export type SwppConfigCrossDep = {
    [K in keyof COMMON_TYPE_CROSS_DEP | string]?: K extends keyof COMMON_TYPE_CROSS_DEP ? COMMON_TYPE_CROSS_DEP[K]['default'] : any
}

/**
 * 运行时事件注册。
 *
 * 该配置项用于在 sw 中注册指定的事件，可以和 {@link SwppConfigRuntimeDep} 一样引用运行时的内容。
 *
 * 对于每一项配置 `<KEY>: <function>`：<KEY> 是事件名，<function> 是事件执行体。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * // 该代码将在 sw.js 中插入事件注册代码
 * // self.addEventListener('fetch', event => {
 * //     // do something
 * // })
 * // 注意：编写 TS 时可能会遇到 FetchEvent 类型找不到的问题，
 * // 这个问题暂时没有特别好的解决方案，把类型改成 any 或者 Event 然后用 @ts-ignore 忽略错误即可。
 * runtimeEvent: {
 *     fetch: (event: FetchEvent) => {
 *         // do something
 *     }
 * }
 * ```
 */
export type SwppConfigRuntimeEvent = {
    [K in keyof COMMON_TYPE_RUNTIME_EVENT | string]?: K extends keyof COMMON_TYPE_RUNTIME_EVENT ? COMMON_TYPE_RUNTIME_EVENT[K]['default'] : FunctionInBrowser<[Event], any>
}

/**
 * 运行时 & 编译期环境变量。
 *
 * 该配置项用于放置需要同时在浏览器环境和 NodeJs 环境中使用的环境变量。
 *
 * 对于每一项配置 `<KEY>: <value | function(): value>`：<KEY> 是函数名（推荐使用大写下划线式命名），`value` 是环境变量的值。
 *
 * 环境变量中应对仅包含非函数内容，当填写的配置项为函数时，swpp 会将函数返回的内容插入到环境变量中。
 *
 * 配置项填写的函数的执行环境为 NodeJs，所以不要编写依赖浏览器环境的代码。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * // 该代码将在 sw.js 中插入一系列常量，同时在编译期也可以动态读取
 * // const EXAMPLE = 'hello swpp'
 * // const FUN_EXAMPLE = 'fun hello swpp'
 * crossEnv: {
 *     EXAMPLE: 'hello swpp',
 *     FUN_EXAMPLE: function() {
 *         return 'fun ' + this.crossEnv.read('EXAMPLE')
 *     }
 * }
 * ```
 */
export type SwppConfigCrossEnv = {
    [K in keyof COMMON_TYPE_CROSS_ENV | string]: ValueOrReturnValue<K extends keyof COMMON_TYPE_CROSS_ENV ? COMMON_TYPE_CROSS_ENV[K]['default'] : any>
}

/**
 * 构建期使用的环境变量。
 *
 * 该配置项用于放置仅需要在 NodeJs 环境中使用的环境变量。
 *
 * 对于每一项配置 `<KEY>: <value | function(): value>`：<KEY> 是函数名（推荐使用大写下划线式命名），`value` 是环境变量的值。
 *
 * 环境变量中应对仅包含非函数内容，当填写的配置项为函数时，swpp 会将函数返回的内容插入到环境变量中。
 *
 * 该环境变量中的代码在 NodeJs 环境下执行，执行结果不会被放入 sw.js 中。
 */
export type SwppConfigCompilationEnv = {
    [K in keyof COMMON_TYPE_COMP_ENV | string]?: K extends keyof COMMON_TYPE_COMP_ENV ? COMMON_TYPE_COMP_ENV[K]['default'] : any
}