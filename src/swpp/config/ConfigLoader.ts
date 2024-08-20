import {createJiti} from 'jiti'
import nodePath from 'path'
import {KeyValueDatabase} from '../database/KeyValueDatabase'
import {CompilationData, RuntimeData} from '../SwCompiler'
import {exceptionNames, RuntimeException} from '../untils'
import {SwppConfigTemplate} from './ConfigCluster'
import {SpecialConfig} from './SpecialConfig'

export class ConfigLoader {

    /** 支持的拓展名列表 */
    private static readonly extensions: ReadonlyArray<string> = [
        'js', 'ts', 'cjs', 'cts', 'mjs', 'mjs'
    ]

    private static jiti = createJiti(__filename, {
        fsCache: false
    })

    private config: SwppConfigTemplate | undefined
    private modifierList: SwppConfigModifier[] = []

    // noinspection JSUnusedGlobalSymbols
    /**
     * 加载一个配置文件，越早加载的优先级越高
     * @param file
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
        // @ts-ignore
        const content: any = await ConfigLoader.jiti.import(file)
        let newConfig: SwppConfigTemplate = 'default' in content ? content.default : content
        this.loadFromCode(newConfig)
    }

    /**
     * 加载一个在代码层面编写的配置
     */
    loadFromCode(config: SwppConfigTemplate) {
        if ('modifier' in config) {
            this.modifierList.push(config.modifier as SwppConfigModifier)
        }
        if (this.config) ConfigLoader.mergeConfig(this.config, config)
        else this.config = config
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