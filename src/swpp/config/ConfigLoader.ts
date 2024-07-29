import createJITI from 'jiti'
import nodePath from 'path'
import {exceptionNames, RuntimeException, utils} from '../untils'

class ConfigLoader {

    /** 支持的拓展名列表 */
    private static readonly extensions: ReadonlyArray<string> = [
        'js', 'ts', 'cjs', 'cts', 'mjs', 'mjs'
    ]
    /** jiti */
    private static jiti = createJITI(__filename, {
        esmResolve: true,
        cache: false,
        extensions: [...ConfigLoader.extensions]
    })

    private config: SwppConfigTemplate | undefined
    private isBuilt = false

    /**
     * 加载一个配置文件，越早调用的优先级越高
     * @param file
     */
    async load(file: string) {
        if (this.isBuilt) {
            throw {
                code: exceptionNames.configBuilt,
                message: '配置文件已经完成构建，不能继续加载新的配置',
                file
            } as RuntimeException
        }
        const extensionName = nodePath.extname(file)
        if (!ConfigLoader.extensions.includes(extensionName)) {
            throw {
                code: exceptionNames.unsupportedFileType,
                message: `配置文件传入了不支持的文件类型：${extensionName}，仅支持：${ConfigLoader.extensions}`,
                file
            } as RuntimeException
        }
        // @ts-ignore
        const content = await ConfigLoader.jiti.import(file) as SwppConfigTemplate
        this.config = this.config ? this.mergeConfig(content) : content
    }

    /**
     * 构建配置
     *
     * 注意：调用该函数后该对象将不能再继续加载配置文件
     */
    build(): Readonly<SwppConfigTemplate> {
        if (!this.config) throw {
            code: exceptionNames.nullPoint,
            message: '构建配之前必须至少加载一个配置文件'
        } as RuntimeException
        return utils.deepFreeze(this.config)
    }

    /** 将新配置合并到已有配置中 */
    private mergeConfig(other: SwppConfigTemplate): SwppConfigTemplate {
        return {
            ...other,
            ...this.config
        }
    }

}

export interface SwppConfigTemplate {



}