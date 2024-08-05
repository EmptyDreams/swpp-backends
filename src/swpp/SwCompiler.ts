import {CompilationEnv} from './database/CompilationEnv'
import {CrossDepCode} from './database/CrossDepCode'
import {DomCode} from './database/DomCode'
import {RuntimeCoreCode} from './database/RuntimeCoreCode'
import {RuntimeDepCode} from './database/RuntimeDepCode'
import {CrossEnv} from './database/CrossEnv'
import {RuntimeEventCode} from './database/RuntimeEventCode'
import {RuntimeKeyValueDatabase} from './database/RuntimeKeyValueDatabase'
import {exceptionNames} from './untils'

export class SwCompiler {

    private swCode: string = ''

    // noinspection JSUnusedGlobalSymbols
    /**
     * 构建 sw 代码，该函数结果会被缓存
     */
    buildSwCode(runtime: RuntimeData): string {
        if (this.swCode) return this.swCode
        runtime.runtimeDep.fixDepFunction()
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
    readonly insertOrder: (Exclude<keyof RuntimeData, 'insertOrder' | 'domConfig'> | string)[] = [
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
    domConfig: DomCode

    constructor(compilationData: CompilationData) {
        this.crossDep = compilationData.crossDep
        this.crossEnv = compilationData.crossEnv
        this.domConfig = new DomCode(compilationData)
    }

    getDatabase(key: string): RuntimeKeyValueDatabase<any, {}> {
        if (!(key in this)) throw {
            code: exceptionNames.invalidKey,
            message: `传入的 key [${key}] 不在当前对象中存在`
        }
        if (key == 'insertOrder') throw {
            code: exceptionNames.invalidKey,
            message: `传入的 key [${key}] 非法`
        }
        // @ts-ignore
        return this[key]
    }

}

/** 编译时数据 */
export class CompilationData {

    crossEnv: CrossEnv = new CrossEnv()
    crossDep: CrossDepCode = new CrossDepCode()
    compilationEnv = new CompilationEnv(this.crossEnv, this.crossDep)

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