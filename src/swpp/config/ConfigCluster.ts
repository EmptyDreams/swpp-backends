import * as crypto from 'node:crypto'
import {COMMON_TYPE_COMP_ENV} from '../database/CompilationEnv'
import {COMMON_TYPE_COMP_FP, FileParser} from '../database/CompilationFileParser'
import {COMMON_TYPE_CROSS_DEP} from '../database/CrossDepCode'
import {COMMON_TYPE_CROSS_ENV} from '../database/CrossEnv'
import {COMMON_TYPE_DOM_CODE} from '../database/DomCode'
import {DatabaseValue} from '../database/KeyValueDatabase'
import {COMMON_TYPE_RUNTIME_CORE} from '../database/RuntimeCoreCode'
import {COMMON_KEY_RUNTIME_DEP, FunctionInBrowser} from '../database/RuntimeDepCode'
import {COMMON_TYPE_RUNTIME_EVENT} from '../database/RuntimeEventCode'
import {SwppConfigModifier} from './ConfigLoader'
import {
    IndivisibleConfig,
    LazyInitConfig,
    NoCacheConfig,
    RuntimeSpecialConfig,
    RuntimeSupplier,
    SpecialConfig
} from './SpecialConfig'

/**
 * 定义一个无法分割的对象配置，这对一些强依赖对象内部属性的设置很有用，可以避免对象被错误地拼接。
 *
 * 默认情况下，当定义一个对象配置时，将允许从其它配置文件中合并一部分配置到对象中，比如：
 *
 * ```typescript
 * // 当前配置
 * exampleConfig.obj = {
 *     value1: 'hello world'
 * }
 * // 如果还有一个配置文件中也声明了这个配置
 * exampleConfig.obj = {
 *     value2: 'hello swpp'
 * }
 * // 最终将合并生成如下配置
 * exampleConfig.obj = {
 *     value1: 'hello world',
 *     value2: 'hello swpp'
 * }
 * ```
 *
 * 通过该函数，可以禁止 swpp 合并配置时仅选取对象的部分字段，要么全部使用 [value] 的值，要么完全不使用 [value] 的值。
 *
 * 放入到上述例子中，假如两个 obj 任意一个或多个通过 `defineIndivisibleConfig({ xxx: xxx })` 设置，最终的值将取决于两个配置文件的优先级，
 * 若 `value2` 的优先级高将产生：
 *
 * ```typescript
 * // 最终结果
 * exampleConfig.obj = {
 *     value2: 'hello swpp'
 * }
 * ```
 */
export function defineIndivisibleConfig<T extends object>(value: T): IndivisibleConfig<T> {
    return new IndivisibleConfig(value)
}

/**
 * 定义一个不会被缓存的配置项。
 *
 * 默认情况下，swpp 会缓存配置项的结果，下一次读取同一个配置项时便不需要经过类型检查等操作。
 *
 * 有些时候可能希望每一次读取值时都动态读取，那么可以使用此方法禁用缓存。
 *
 * 注意：
 *
 * 1. 该选项禁用缓存后对于性能有些许影响，计算结果和校验的成本越高影响越大，一般情况下无显著影响。
 * 2. 使用无缓存配置时也会同时禁用配置合并
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * // config 1
 * export const xxx = defineXxx({
 *     example: Date.now()
 * })
 * // config 2
 * export const nnn = defineNnn({
 *     example: defineNoCacheConfig(() => Date.now())
 * })
 * ```
 *
 * 对于上方这个例子，第一种写法每次读取该项配置时，结果都将相同，第一次为 `123456` 那么以后永远都将是 `123456`，而对于第二种写法，则每次调用时都能动态地获取当前系统时间。
 */
export function defineNoCacheConfig<T>(getter: RuntimeSupplier<T>): NoCacheConfig<T> {
    return new NoCacheConfig<T>(getter)
}

/**
 * 定义一个延迟初始化的配置项。
 *
 * 默认情况下，swpp 会在加载配置文件时对各项配置的值进行计算，此时就出现了一个问题，您无法在设置配置时访问其它配置内容。
 *
 * 如果您希望能够延后计算配置项的值以访问其它配置项，则可以使用该函数定义配置。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * export const xxx = defineXxx({
 *     example: defineLazyInitConfig((runtime, compilation) => {
 *         // 这里的代码将在第一次读取配置时执行
 *         // do something
 *         return <value>
 *     })
 * })
 * ```
 */
export function defineLazyInitConfig<T>(getter: RuntimeSupplier<T>): LazyInitConfig<T> {
    return new LazyInitConfig(getter)
}

/**
 * SWPP 配置模板
 *
 * 如果配置文件是 TS 编写的，配置文件的所有内容均可放心使用 TS 进行编写，SWPP 会将 TS 代码转换为 JS 再插入到 sw.js 中
 */
export interface SwppConfigTemplate {

    /** @see {SwppConfigCompilationEnv} */
    compilationEnv?: SwppConfigCompilationEnv

    /** @see {SwppConfigCrossEnv} */
    crossEnv?: SwppConfigCrossEnv

    /** @see {SwppConfigRuntimeDep} */
    runtimeDep?: SwppConfigRuntimeDep

    /** @see {SwppConfigCrossDep} */
    crossDep?: SwppConfigCrossDep

    /** @see {SwppConfigRuntimeCore} */
    runtimeCore?: SwppConfigRuntimeCore

    /** @see {SwppConfigRuntimeEvent} */
    runtimeEvent?: SwppConfigRuntimeEvent

    /** @see {SwppConfigDomConfig} */
    domConfig?: SwppConfigDomConfig

    /** @see {SwppConfigCompilationFileParser} */
    compilationFileParser?: SwppConfigCompilationFileParser

    /** 配置编辑器 */
    modifier?: SwppConfigModifier

}

type OptionalMap<T> = T extends object ? {[K in keyof T]?: T[K]} : T

type SwppConfigValueExp<T> = T extends RuntimeSpecialConfig<any> ? (T | OptionalMap<ReturnType<T['get']>>) : (OptionalMap<T> | RuntimeSpecialConfig<T>)

type SwppConfigHelper<R, C extends Record<string, DatabaseValue<R>>> = {
    [K in keyof C]?: SwppConfigValueExp<C[K]['default']>
} & {
    [K in string]: SwppConfigValueExp<R>
}

/**
 * 运行时函数依赖。
 *
 * 该配置项用于放置所有仅在浏览器 SW 环境下执行的工具函数。
 *
 * 对于每一项配置 `<KEY>: <function>`：`<KEY>` 是函数名（推荐使用小写驼峰式命名），`<function>` 是函数体。
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
 * // let example = any             不推荐，因为丢失了类型，会影响 IDE 的自动补全和静态类型推断
 * // 或者直接在函数调用的位置使用 @ts-ignore 也可以避免报错，同样不推荐，理由同上
 * ```
 */
export type SwppConfigRuntimeDep = SwppConfigHelper<FunctionInBrowser<any[], any> | null, COMMON_KEY_RUNTIME_DEP>

/**
 * 运行时核心功能.
 *
 * 该配置项用于放置所有核心功能函数，用法与 {@link SwppConfigRuntimeDep} 相同。
 *
 * 该配置项与 RuntimeDep 不同的是两者的定位，RuntimeDep 中主要放置一些简单的工具函数，而 RuntimeCore 则放置一些核心代码。
 * 默认情况下，RuntimeCore 也将被插入到 RuntimeDep 的后面，在一些特殊情况下可以避免一些声明顺序导致的问题。
 */
export type SwppConfigRuntimeCore = SwppConfigHelper<FunctionInBrowser<any[], any>, COMMON_TYPE_RUNTIME_CORE>

/**
 * 运行时 & 编译期的函数依赖。
 *
 * 该配置项用于放置所有同时在浏览器和 NodeJs 环境下执行的工具函数。
 *
 * 对于每一项配置 `<KEY>: { <runOnBrowser>, <runOnNode> }`：`<KEY>` 是函数名，
 * `<runOnBrowser>` 是在浏览器环境下执行的代码，`<runOnNode>` 是在 NodeJs 环境下执行的代码。
 *
 * 对于在浏览器环境下执行的代码，可以像 {@link SwppConfigRuntimeDep} 一样引用其它运行时的环境变量、依赖函数等内容。
 *
 * 对于在 NodeJs 环境下执行的代码，可以使用 `this` 调用 `<runOnBrowser>`（前提是 `<runOnBrowser>` 中没有依赖浏览器环境的代码）。
 *
 * `<runOnBrowser>` 和 `<runOnNode>` 中的代码的行为应当完全一致。注意：此处说的行为一致是两者应当产生相同的副作用，内部具体实现可以不一样。
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
export type SwppConfigCrossDep = SwppConfigHelper<any, COMMON_TYPE_CROSS_DEP>

/**
 * 运行时事件注册。
 *
 * 该配置项用于在 sw 中注册指定的事件，可以和 {@link SwppConfigRuntimeDep} 一样引用运行时的内容。
 *
 * 对于每一项配置 `<KEY>: <function>`：`<KEY>` 是事件名，`<function>` 是事件执行体。
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
export type SwppConfigRuntimeEvent = SwppConfigHelper<FunctionInBrowser<[Event], any>, COMMON_TYPE_RUNTIME_EVENT>

/**
 * 运行时 & 编译期环境变量。
 *
 * 该配置项用于放置需要同时在浏览器环境和 NodeJs 环境中使用的环境变量。
 *
 * 对于每一项配置 `<KEY>: <value>`：`<KEY>` 是变量名（推荐使用大写下划线式命名），`value` 是环境变量的值，环境变量中应对仅包含非函数内容。
 *
 * 配置项填写的函数的执行环境为 NodeJs，所以不要编写依赖浏览器环境的代码。
 *
 * ---
 *
 * 例：
 *
 * ```typescript
 * // 该代码将在 sw.js 中插入一个常量
 * // const EXAMPLE = 'hello swpp'
 * crossEnv: {
 *     EXAMPLE: 'hello swpp'
 * }
 * ```
 */
export type SwppConfigCrossEnv = SwppConfigHelper<any, COMMON_TYPE_CROSS_ENV>

/**
 * 构建期使用的环境变量。
 *
 * 该配置项用于放置仅需要在 NodeJs 环境中使用的环境变量。
 *
 * 对于每一项配置 `<KEY>: <value | function(): value>`：`<KEY>` 是属性名（推荐函数使用小写驼峰，常量使用大写下划线式命名），`<value>` 是环境变量的值。
 *
 * 该环境变量中的代码在 NodeJs 环境下执行，执行结果不会被放入 sw.js 中。
 */
export type SwppConfigCompilationEnv = SwppConfigHelper<any, COMMON_TYPE_COMP_ENV>

/**
 * 构建期使用的文件处理器。
 *
 * 该配置项用于放置需要在 NodeJs 环境中使用的文件处理器。
 *
 * 对于每一项配置 `<KEY>: <FileParser>`: <KEY> 是文件拓展名（不包括 `.`），<FileParser> 是处理机。
 *
 * @see {FileParser}
 */
export type SwppConfigCompilationFileParser = SwppConfigHelper<FileParser<crypto.BinaryLike>, COMMON_TYPE_COMP_FP>

/**
 * 运行时使用的常量、函数。
 *
 * 该配置项用于放置需要生成到 dom.js 中的内容。
 *
 * 对于每一项配置 `<KEY>: <value>`：<KEY> 是常量名或函数名，常量推荐大写下划线命名，函数推荐小写驼峰命名，<value> 是值。
 *
 * 该配置项中的值只能使用本配置项中包含的内容，不能使用其它编译期、运行期的内容。
 *
 * 该配置项中所有以 `_inline` 开头的内容必须为 `() => void` 类型的函数，其将会以 `(function content)()` 的形式在插入的位置执行。
 */
export type SwppConfigDomConfig = SwppConfigHelper<any, COMMON_TYPE_DOM_CODE>