import {CompilationEnv} from './database/CompilationEnv'
import {CompilationFileParser} from './database/CompilationFileParser'
import {CrossDepCode} from './database/CrossDepCode'
import {DomCode} from './database/DomCode'
import {KeyValueDatabase} from './database/KeyValueDatabase'
import {RuntimeCoreCode} from './database/RuntimeCoreCode'
import {RuntimeDepCode} from './database/RuntimeDepCode'
import {CrossEnv} from './database/CrossEnv'
import {RuntimeEventCode} from './database/RuntimeEventCode'
import {RuntimeKeyValueDatabase} from './database/RuntimeKeyValueDatabase'
import {CallChainRecorder} from './debug/CallChainRecorder'
import {exceptionNames, RuntimeException} from './untils'

export class SwCompiler {

    private swCode: string = ''

    // noinspection JSUnusedGlobalSymbols
    /**
     * 构建 sw 代码，该函数结果会被缓存
     */
    buildSwCode(runtime: RuntimeData): string {
        if (this.swCode) return this.swCode
        this.swCode = '(() => {' + runtime.insertOrder
            .map(it => runtime.getDatabase(it).buildJsSource())
            .join(';\n')
        + '})()'
        return this.swCode
    }

}

/** 运行时数据 */
export class RuntimeData {

    /** 控制插入顺序 */
    insertOrder: (Exclude<keyof RuntimeData, 'insertOrder' | 'domConfig'> | string)[] = [
        'crossEnv', 'crossDep', 'runtimeDep', 'runtimeCore', 'runtimeEvent'
    ]

    /** 运行时环境变量 */
    crossEnv: CrossEnv
    /** 运行时工具函数 */
    runtimeDep = new RuntimeDepCode()
    /** 运行时核心功能函数 */
    runtimeCore = new RuntimeCoreCode()
    /** 运行时事件注册 */
    runtimeEvent = new RuntimeEventCode()
    /** 运行时/编译时工具函数 */
    crossDep: CrossDepCode
    /** DOM 相关设置 */
    domConfig = new DomCode()
    /** 追踪调用链 */
    debugCallChain = new CallChainRecorder()

    constructor(compilationData: CompilationData) {
        this.crossDep = compilationData.crossDep
        this.crossEnv = compilationData.crossEnv
    }

    getDatabase(key: string): RuntimeKeyValueDatabase<any, {}> {
        if (!(key in this))
            throw new RuntimeException(exceptionNames.invalidKey, `传入的 key [${key}] 不在当前对象中存在`)
        if (key == 'insertOrder')
            throw new RuntimeException(exceptionNames.invalidKey, `传入的 key [${key}] 非法`)
        // @ts-ignore
        return this[key]
    }

    initCompilation(compilation: CompilationData) {
        for (let key of this.insertOrder) {
            this.getDatabase(key).initRuntimeAndCompilation(this, compilation)
        }
        this.domConfig.initRuntimeAndCompilation(this, compilation)
    }

    freezeAll() {
        this.insertOrder.forEach(it => this.getDatabase(it).freeze())
        this.domConfig.freeze()
    }

}

/** 编译时数据 */
export class CompilationData {

    compilationEnv = new CompilationEnv()
    crossDep: CrossDepCode = new CrossDepCode()
    crossEnv: CrossEnv = new CrossEnv()
    fileParser = new CompilationFileParser()

    initRuntime(runtime: RuntimeData) {
        for (let key in this) {
            const value = this[key]
            if (value instanceof KeyValueDatabase) {
                value.initRuntimeAndCompilation(runtime, this)
            }
        }
    }

    freezeAll() {
        for (let key in this) {
            const value = this[key]
            if (value instanceof KeyValueDatabase) {
                value.freeze()
            }
        }
    }

}

/** 版本号信息 */
export interface BrowserVersion {
    /** 逃生门版本号 */
    escape: number,
    /** 静态版本号 */
    global: number,
    /** 动态版本号 */
    local: number,
    /** 时间戳 */
    tp?: number
}