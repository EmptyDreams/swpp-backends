import {createJiti} from 'jiti'
import nodePath from 'path'
import {KeyValueDatabase} from '../database/KeyValueDatabase'
import {CompilationData, RuntimeData} from '../SwCompiler'
import {exceptionNames, RuntimeException, utils} from '../untils'
import {
    SwppConfigCompilationEnv,
    SwppConfigCompilationFileParser,
    SwppConfigCrossDep,
    SwppConfigCrossEnv,
    SwppConfigDomConfig,
    SwppConfigRuntimeCore,
    SwppConfigRuntimeDep,
    SwppConfigRuntimeEvent,
    SwppConfigTemplate
} from './ConfigCluster'
import {SpecialConfig} from './SpecialConfig'

/** 正在加载配置的 loader */
let activeConfigLoader: ConfigLoaderLock | null = null
const TMP_PW = Math.random().toString()

export class ConfigLoader {

    /** 支持的拓展名列表 */
    private static readonly extensions: ReadonlyArray<string> = [
        'js', 'ts', 'cjs', 'cts', 'mjs', 'mjs'
    ]

    private static jiti = createJiti(__filename, {
        fsCache: false
    })

    private static prevTask: Promise<any> | null = null

    private config: SwppConfigTemplate | undefined
    private modifierList: SwppConfigModifier[] = []

    constructor() {
        Object.defineProperty(this, '9zLoadFromInside', {
            value: (config: SwppConfigTemplate, pw: string) => {
                if (pw !== TMP_PW) throw new RuntimeException(exceptionNames.error, '该函数仅能由内部调用')
                if ('modifier' in config) {
                    this.modifierList.push(config.modifier as SwppConfigModifier)
                }
                if (this.config) ConfigLoader.mergeConfig(this.config, config)
                else this.config = config
            },
            writable: false,
            enumerable: false
        })
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * 加载一个配置文件，越早加载的优先级越高
     * @param file 配置文件的绝对路径
     */
    async load(file: string) {
        const extensionName = nodePath.extname(file).substring(1)
        if (!ConfigLoader.extensions.includes(extensionName)) {
            throw new RuntimeException(
                exceptionNames.unsupportedFileType,
                `配置文件传入了不支持的文件类型：${extensionName}，仅支持：${ConfigLoader.extensions}`,
                { configPath: file }
            )
        }
        await ConfigLoader.waitLoad()
        let error = true
        activeConfigLoader?.onRelease?.()
        activeConfigLoader = new ConfigLoaderLock(this, () => {
            if (error) throw new RuntimeException(exceptionNames.error, '锁竞争时出现异常')
        }, nodePath.normalize(file))
        ConfigLoader.prevTask = ConfigLoader.jiti.import(file).then(() => error = false)
    }

    /**
     * 加载一个在代码层面编写的配置
     */
    // noinspection JSUnusedGlobalSymbols
    async loadFromCode(config: SwppConfigTemplate) {
        await ConfigLoader.waitLoad()
        // @ts-ignore
        this['9zLoadFromInside'](config, TMP_PW)
    }

    private static async waitLoad() {
        let prev: Promise<any> | null
        do {
            prev = ConfigLoader.prevTask
            await prev
        } while (prev !== ConfigLoader.prevTask)
    }

    // noinspection JSUnusedGlobalSymbols
    /** 将配置项的内容写入到环境中 */
    generate(): Readonly<{
        runtime: RuntimeData,
        compilation: CompilationData
    }> {
        if (!this.config)
            throw new RuntimeException(exceptionNames.nullPoint, '构建配之前必须至少加载一个配置文件')
        // 构建属性集
        const {runtime, compilation} = (this.modifierList.find(it => it.build)?.build ?? (() => {
            const compilation = new CompilationData()
            const runtime = new RuntimeData(compilation)
            return {runtime, compilation}
        }))()
        runtime.initCompilation(compilation)
        compilation.initRuntime(runtime)
        const config = this.config!
        /** 将指定配置项目写入到 KV 库中 */
        const writeConfigToKv = (key: string, value: any, database: KeyValueDatabase<any, any>) => {
            if (SpecialConfig.isNoCacheConfig(value)) {
                database.update(key, value)
            } else {
                if (typeof value === 'object') {
                    const def = database.readDefault(key)
                    ConfigLoader.mergeConfig(value, def, false)
                }
                database.update(key, value ?? null)
            }
        }
        // 写入运行时信息
        const writeRuntime = () => {
            for (let configKey in config) {
                if (!/^(runtime|dom)[A-Z_]/.test(configKey)) continue
                const configValue = config[configKey as keyof SwppConfigTemplate] as any
                const database = runtime.getDatabase(configKey)
                for (let key in configValue) {
                    writeConfigToKv(key, configValue[key], database)
                }
            }
        }
        // 写入编译期信息
        const writeCompilation = () => {
            if (!config.compilationEnv)
                throw new RuntimeException(exceptionNames.nullPoint, '配置项必须包含 compilationEnv 选项！')
            for (let configKey in config) {
                if (!/^compilation[A-Z_]/.test(configKey)) continue
                if (!(configKey in compilation)) {
                    throw new RuntimeException(exceptionNames.nullPoint, `配置项中传入了一个不存在的分类[${configKey}]`)
                }
                const env = config[configKey as keyof SwppConfigTemplate]
                for (let key in env) {
                    writeConfigToKv(key, (env as any)[key], (compilation as any)[configKey])
                }
            }
        }
        // 写入 cross
        const writeCross = () => {
            for (let configKey in config) {
                if (!/^cross[A-Z_]/.test(configKey)) continue
                const env = config[configKey as keyof SwppConfigTemplate]
                const database = runtime.getDatabase(configKey)
                for (let key in env) {
                    writeConfigToKv(key, (env as any)[key], database)
                }
            }
        }

        // 运行 registry
        for (let i = this.modifierList.length - 1; i >= 0; i--) {
            const modifier = this.modifierList[i]
            modifier.registry?.(runtime, compilation)
        }
        writeRuntime()
        writeCompilation()
        writeCross()
        // 运行 dynamicUpdate
        for (let i = this.modifierList.length - 1; i >= 0; i--) {
            const modifier = this.modifierList[i]
            modifier.dynamicUpdate?.(runtime, compilation)
        }
        // 冻结 KV 库
        runtime.freezeAll()
        compilation.freezeAll()
        Object.freeze(runtime.insertOrder)
        Object.freeze(runtime)
        Object.freeze(compilation)
        return Object.freeze({runtime, compilation})
    }

    /** 将新配置合并到已有配置中 */
    private static mergeConfig(config: any, other: SwppConfigTemplate | any, isTop: boolean = true) {
        function mergeHelper(high: any, low: any, skip: boolean) {
            for (let key in low) {
                if (skip && key == 'modifier') continue
                const lowValue = low[key]
                if (key in high) {
                    const highValue = high[key]
                    if (highValue === undefined) {
                        high[key] = lowValue
                        continue
                    }
                    if (typeof highValue != typeof lowValue) continue
                    if (typeof highValue == 'object' && !SpecialConfig.isIndivisibleConfig(highValue)) {
                        mergeHelper(highValue, lowValue, false)
                    }
                } else {
                    high[key] = lowValue
                }
            }
        }
        mergeHelper(config, other, isTop)
    }

}

/**
 * 配置编辑器
 */
export interface SwppConfigModifier {

    /**
     * 自定义运行时和编译期的属性表
     *
     * 优先级越高越优先生效
     */
    build?: () => {
        runtime: RuntimeData,
        compilation: CompilationData
    }

    /**
     * 本函数用于向系统注册新的属性。
     *
     * 该函数内应当只调用 xxx.append 函数及其它工具函数，非必要不应当包含其它有副作用的操作。
     *
     * 优先级越低该函数越早执行。
     */
    registry?: (runtime: RuntimeData, compilation: CompilationData) => void

    /**
     * 本函数用于动态修改属性的值。
     *
     * 该函数内应当只调用 xxx.update 函数及其它工具函数，非必要不应当包含其它有副作用的操作。
     *
     * 优先级越低该函数越早执行
     */
    dynamicUpdate?: (runtime: RuntimeData, compilation: CompilationData) => void

}

class ConfigLoaderLock {

    constructor(
        public readonly loader: ConfigLoader,
        public readonly onRelease: () => void,
        private readonly file: string
    ) { }

    check(file: string) {
        if (file !== this.file)
            throw new RuntimeException(exceptionNames.error, `错误地在 ${this.file} 加载时期载入了 ${file} 中的配置`)
    }

}

function invokeLoader(loader: ConfigLoader, config: SwppConfigTemplate) {
    const stack = new Error().stack!.split('\n')
    const dist = stack[3]
    let filePath: string
    if (dist.endsWith(')')) {
        const startIndex = dist.lastIndexOf('(')
        const endIndex = utils.findSecondLastIndex(dist, ':')
        filePath = dist.substring(startIndex + 1, endIndex)
    } else {
        const startIndex = dist.indexOf('at ')
        const endIndex = utils.findSecondLastIndex(dist, ':')
        filePath = dist.substring(startIndex + 3, endIndex)
    }
    activeConfigLoader!.check(nodePath.normalize(filePath))
    // @ts-ignore
    loader['9zLoadFromInside'](config, TMP_PW)
}

/** 定义一个通过 `export default` 导出的配置 */
export function defineConfig(config: SwppConfigTemplate) {
    invokeLoader(activeConfigLoader!.loader, config)
}

/** 定义一个通过 `export const compilationEnv` 导出的配置 */
export function defineCompilationEnv(config: SwppConfigCompilationEnv) {
    invokeLoader(activeConfigLoader!.loader, {compilationEnv: config})
}

/** 定义一个通过 `export const compilationFileParser` 导出的配置 */
export function defineCompilationFP(config: SwppConfigCompilationFileParser) {
    invokeLoader(activeConfigLoader!.loader, {compilationFileParser: config})
}

/** 定义一个通过 `export const crossEnv` 导出的配置 */
export function defineCrossEnv(config: SwppConfigCrossEnv) {
    invokeLoader(activeConfigLoader!.loader, {crossEnv: config})
}

/** 定义一个通过 `export const runtimeDep` 导出的配置 */
export function defineRuntimeDep(config: SwppConfigRuntimeDep) {
    invokeLoader(activeConfigLoader!.loader, {runtimeDep: config})
}

/** 定义一个通过 `export const crossDep` 导出的配置 */
export function defineCrossDep(config: SwppConfigCrossDep) {
    invokeLoader(activeConfigLoader!.loader, {crossDep: config})
}

/** 定义一个通过 `export const runtimeCore` 导出的配置 */
export function defineRuntimeCore(config: SwppConfigRuntimeCore) {
    invokeLoader(activeConfigLoader!.loader, {runtimeCore: config})
}

/** 定义一个通过 `export const domConfig` 导出的配置 */
export function defineDomConfig(config: SwppConfigDomConfig) {
    invokeLoader(activeConfigLoader!.loader, {domConfig: config})
}

/** 定义一个通过 `export const runtimeEvent` 导出的配置 */
export function defineRuntimeEvent(config: SwppConfigRuntimeEvent) {
    invokeLoader(activeConfigLoader!.loader, {runtimeEvent: config})
}

/** 定义一个通过 `export const modifier` 导出的配置 */
export function defineModifier(config: SwppConfigModifier) {
    invokeLoader(activeConfigLoader!.loader, {modifier: config})
}