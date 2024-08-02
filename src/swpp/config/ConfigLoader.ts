import {createJiti} from 'jiti'
import nodePath from 'path'
import {CompilationData, RuntimeData} from '../SwCompiler'
import {exceptionNames, RuntimeException} from '../untils'
import {SwppConfigTemplate} from './ConfigCluster'

export const IndivisibleName = '1indivisible__'

export class ConfigLoader {

    /** 支持的拓展名列表 */
    private static readonly extensions: ReadonlyArray<string> = [
        'js', 'ts', 'cjs', 'cts', 'mjs', 'mjs'
    ]

    private static jiti = createJiti(__filename, {
        fsCache: false,
        alias: {
            'swpp-backends': nodePath.join(__dirname, '..', '..', 'index')
        }
    })

    private config: SwppConfigTemplate | undefined
    private isBuilt = false

    // noinspection JSUnusedGlobalSymbols
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

    // noinspection JSUnusedGlobalSymbols
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
                    if (typeof highValue == 'object' && !highValue[IndivisibleName] && !lowValue[IndivisibleName]) {
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