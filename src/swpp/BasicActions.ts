import fs from 'fs'
import nodePath from 'path'
import {SwppConfigTemplate} from './config/ConfigCluster'
import {ConfigLoader} from './config/ConfigLoader'
import {ResourcesScanner} from './ResourcesScanner'
import {CompilationData, RuntimeData, SwCompiler} from './SwCompiler'
import {exceptionNames, RuntimeException, utils} from './untils'

export class BasicActions {

    /**
     * 构建一个基础的 swpp 行为封装器
     * @param context 运行环境，dev 表示开发环境，prod 表示生产环境
     * @param publicPath 网站根目录
     * @param isBuildServiceWorker 是否构建 sw.js
     * @param domJsPath dom js 的生成路径，留空表示不生成
     * @param diffJsonPath diff json 的生成路径，留空表示不生成
     */
    static async build(
        context: 'dev' | 'prod',
        publicPath: string,
        isBuildServiceWorker: boolean = true,
        domJsPath?: string,
        diffJsonPath?: string
    ): Promise<BasicActions> {
        const actions = new BasicActions(
            context,
            isBuildServiceWorker,
            domJsPath,
            diffJsonPath
        )
        await actions.configLoader!.loadFromCode({
            compilationEnv: {
                PUBLIC_PATH: publicPath
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
        trackerJson: null as string|null,
        versionJson: null as string|null,
        serviceWorker: null as string|null,
        domJs: null as string|null,
        diffJson: null as string|null
    }

    private constructor(
        public readonly context: 'dev' | 'prod',
        private readonly isBuildServiceWorker: boolean,
        private readonly domJsPath: string | undefined,
        private readonly diffJsonPath: string | undefined
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
        for (let pathOrCode in pathOrCodes) {
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
        this.paths.trackerJson = nodePath.join(publicRoot, jsonInfo.swppPath, jsonInfo.trackerPath)
        this.paths.versionJson = nodePath.join(publicRoot, jsonInfo.swppPath, jsonInfo.versionPath)
        if (this.isBuildServiceWorker) {
            const swPath = compilationEnv.read('SERVICE_WORKER')
            this.paths.serviceWorker = nodePath.join(publicRoot, swPath + '.js')
        }
        if (this.domJsPath) {
            this.paths.domJs = nodePath.join(publicRoot, this.domJsPath)
        }
        if (this.diffJsonPath) {
            this.paths.diffJson = this.diffJsonPath
        }
    }

    /**
     * 生成 swpp 的各项 json、js 文件
     */
    async buildFiles(): Promise<void> {
        if (!this.compilationData || !this.runtimeData) {
            throw new RuntimeException(exceptionNames.configBuilt, '配置文件加载阶段还未结束')
        }
        for (let key in this.paths) {
            // @ts-ignore
            const path = this.paths[key] as string
            if (path && fs.existsSync(path)) {
                throw new RuntimeException(exceptionNames.fileDuplicate, `指定文件[${path}]已存在`)
            }
        }
        for (let key in this.paths) {
            // @ts-ignore
            const path = this.paths[key] as string
            const dirname = nodePath.dirname(path)
            if (!fs.existsSync(dirname)) {
                await fs.promises.mkdir(dirname, {recursive: true})
            }
        }
        const publicRoot = this.compilationData.compilationEnv.read('PUBLIC_PATH')
        const scanner = new ResourcesScanner(this.compilationData)
        const newTracker = await scanner.scanLocalFile(publicRoot)
        const updateJsonBuilder = await newTracker.diff()
        const updateJson = await updateJsonBuilder.buildJson()
        const fileList = [
            {
                path: this.paths.trackerJson,
                content: newTracker.json()
            }, {
                path: this.paths.versionJson,
                content: JSON.stringify(updateJson)
            }, (this.paths.serviceWorker && {
                path: this.paths.serviceWorker,
                content: new SwCompiler().buildSwCode(this.runtimeData!)
            }), (this.paths.domJs && {
                path: this.paths.domJs,
                content: this.runtimeData!.domConfig.buildJsSource()
            }), (this.paths.diffJson && {
                path: this.paths.diffJson,
                content: updateJsonBuilder.serialize()
            })
        ]
        await Promise.all(
            fileList.filter(it => it)
                .map((it: any) => utils.writeFile(it.path, it.content))
        )
    }

}