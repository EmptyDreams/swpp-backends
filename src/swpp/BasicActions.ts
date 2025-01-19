import fs from 'fs'
import {defineLazyInitConfig, SwppConfigTemplate} from './config/ConfigCluster'
import {ConfigLoader} from './config/ConfigLoader'
import {FilePath} from './FilePath'
import {FileUpdateTracker, ResourcesScanner} from './ResourcesScanner'
import {CompilationData, RuntimeData, SwCompiler} from './SwCompiler'
import {exceptionNames, RuntimeException, utils} from './untils'

export class BasicActions {

    /**
     * 构建一个基础的 swpp 行为封装器
     */
    static async build(
        optional: BasicActionOptions
    ): Promise<BasicActions> {
        const actions = new BasicActions(
            optional.context,
            optional.isServiceWorker,
            optional.domJsPath,
            optional.diffJsonPath,
            optional.trackLink !== true
        )
        await actions.configLoader!.loadFromCode({
            compilationEnv: {
                PUBLIC_PATH: defineLazyInitConfig((_, compilation) => {
                    return FilePath.buildPublicRoot(optional.publicPath, compilation.compilationEnv.read('PROJECT_PATH'))
                })
            }
        })
        return actions
    }

    configLoader?: ConfigLoader = new ConfigLoader(this.context)

    runtimeData?: RuntimeData
    compilationData?: CompilationData

    /**
     * 各个文件的生成路径，为空则表示不生成（或配置未初始化）
     */
    paths = {
        trackerJson: null as FilePath|null,
        versionJson: null as FilePath|null,
        serviceWorker: null as FilePath|null,
        domJs: null as FilePath|null,
        diffJson: null as FilePath|null
    }

    private constructor(
        public readonly context: 'dev' | 'prod',
        private readonly isBuildServiceWorker: boolean,
        private readonly domJsPath: string | undefined,
        private readonly diffJsonPath: string | undefined,
        private readonly disableTrack: boolean
    ) {}

    /**
     * 加载一个配置文件或配置
     * @param pathOrCode 配置文件的绝对路径或配置对象
     */
    loadConfig(pathOrCode: string | SwppConfigTemplate): Promise<void> {
        if (!this.configLoader) {
            throw new RuntimeException(exceptionNames.configBuilt, '配置文件加载阶段已经结束')
        }
        if (typeof pathOrCode === 'string') {
            return this.configLoader.load(pathOrCode)
        } else {
            return this.configLoader.loadFromCode(pathOrCode)
        }
    }

    /**
     * 批量加载配置项
     * @param pathOrCodes
     */
    async loadConfigs(pathOrCodes: (string | SwppConfigTemplate)[]): Promise<void> {
        for (let pathOrCode of pathOrCodes) {
            await this.loadConfig(pathOrCode)
        }
    }

    /**
     * 生成配置对象
     */
    buildConfig() {
        if (!this.configLoader) {
            throw new RuntimeException(exceptionNames.configBuilt, '配置文件加载阶段已经结束')
        }
        const {runtime, compilation} = this.configLoader.generate()
        this.runtimeData = runtime
        this.compilationData = compilation
        this.configLoader = undefined

        const compilationEnv = compilation.compilationEnv
        const publicRoot = compilationEnv.read('PUBLIC_PATH')
        const jsonInfo = compilationEnv.read('SWPP_JSON_FILE')
        this.paths.trackerJson = publicRoot.join(jsonInfo.swppPath, jsonInfo.trackerPath)
        this.paths.versionJson = publicRoot.join(jsonInfo.swppPath, jsonInfo.versionPath)
        if (this.isBuildServiceWorker) {
            const swPath = compilationEnv.read('SERVICE_WORKER')
            this.paths.serviceWorker = publicRoot.join(swPath + '.js')
        }
        if (this.domJsPath) {
            this.paths.domJs = publicRoot.join(this.domJsPath)
        }
        if (this.diffJsonPath) {
            this.paths.diffJson = publicRoot.join(this.diffJsonPath)
        }
    }

    private buildCache: BuildFileInfo[] | null = null

    /**
     * 构建 swpp 的各项 json、js 文件
     * @param excludeFilter 需排除的文件
     */
    async buildFiles(excludeFilter: BasicActionKey[] = []): Promise<BuildFileInfo[]> {
        if (!this.compilationData || !this.runtimeData) {
            throw new RuntimeException(exceptionNames.configBuilt, '配置文件加载阶段还未结束')
        }
        if (this.buildCache !== null) return this.buildCache
        const publicRoot = this.compilationData.compilationEnv.read('PUBLIC_PATH')
        const scanner = new ResourcesScanner(this.compilationData)
        let newTracker: FileUpdateTracker | null = null
        let updateJsonBuilder: any = null
        // @ts-ignore
        return this.buildCache = [
            (!excludeFilter.includes('tracker') && {
                key: 'tracker',
                path: this.paths.trackerJson,
                content: (newTracker = await scanner.scanLocalFile(publicRoot)).json()
            }), (newTracker && !excludeFilter.includes('version') && {
                key: 'version',
                path: this.paths.versionJson,
                content: JSON.stringify(await (updateJsonBuilder = await newTracker.diff()).buildJson())
            }), (this.paths.serviceWorker && !excludeFilter.includes('serviceWorker') && {
                key: 'serviceWorker',
                path: this.paths.serviceWorker,
                content: new SwCompiler().buildSwCode(this.runtimeData!)
            }), (this.paths.domJs && !excludeFilter.includes('domJs') && {
                key: 'domJs',
                path: this.paths.domJs,
                content: this.runtimeData!.domConfig.buildJsSource()
            }), (updateJsonBuilder && this.paths.diffJson && !excludeFilter.includes('diffJson') && {
                key: 'diffJson',
                path: this.paths.diffJson,
                content: updateJsonBuilder.serialize()
            })
        ].filter(it => it)
    }

    /**
     * 生成 swpp 的各项 json、js 文件并写入到硬盘
     * @param excludeFilter 需排除的文件
     */
    async saveFiles(excludeFilter: BasicActionKey[] = []): Promise<void> {
        if (this.disableTrack) {
            if (!excludeFilter.includes('tracker')) {
                excludeFilter.push('tracker')
            }
            if (!excludeFilter.includes('version')) {
                excludeFilter.push('version')
            }
            if (!excludeFilter.includes('diffJson')) {
                excludeFilter.push('diffJson')
            }
        }
        const fileList = await this.buildFiles(excludeFilter)
        await Promise.all(
            fileList.map(it => utils.writeFile(it.path.absPath, it.content))
        )
    }

}

export type BasicActionKey = 'tracker' | 'version' | 'serviceWorker' | 'domJs' | 'diffJson'

export interface BasicActionOptions {

    /** 上下文环境 */
    context: 'dev' | 'prod'
    /** 网站根目录（相对于项目根目录） */
    publicPath: string
    /** 是否生成 sw.js 文件 */
    isServiceWorker: boolean
    /** dom.js 文件路径（相对于网站根目录，留空表示不生成） */
    domJsPath?: string
    /** diff.json 文件路径（相对于网站根目录，留空表示不生成） */
    diffJsonPath?: string
    /** 是否进行引用的静态分析，留空表示不进行（禁用静态分析后不能使用无限期缓存） */
    trackLink?: boolean

}

interface BuildFileInfo {
    key: BasicActionKey,
    path: FilePath,
    content: string
}