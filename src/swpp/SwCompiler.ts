import {CompilationEnv} from './database/CompilationEnv'
import {CrossDepCode} from './database/CrossDepCode'
import {RuntimeCoreCode} from './database/RuntimeCoreCode'
import {RuntimeDepCode} from './database/RuntimeDepCode'
import {RuntimeEnv} from './database/RuntimeEnv'
import {RuntimeEventCode} from './database/RuntimeEventCode'

export class SwCompiler {

    private swCode: string = ''

    /**
     * 构建 sw 代码，该函数结果会被缓存
     */
    buildSwCode(runtime: RuntimeData): string {
        if (this.swCode) return this.swCode
        runtime.runtimeDep.fixDepFunction()
        this.swCode = '(() => {' + runtime.insertOrder
            .map(it => runtime[it].buildJsSource())
            .join(';\n')
        + '})()'
        return this.swCode
    }

}

/** 运行时数据 */
export class RuntimeData {

    /** 控制插入顺序 */
    readonly insertOrder: ReadonlyArray<keyof Omit<RuntimeData, 'insertOrder'>> = [
        'runtimeEnv', 'crossDep', 'runtimeDep', 'runtimeCore', 'runtimeEvent'
    ]

    /** 运行时环境变量 */
    readonly runtimeEnv = new RuntimeEnv()
    /** 运行时工具函数 */
    readonly runtimeDep = new RuntimeDepCode()
    /** 运行时核心功能函数 */
    readonly runtimeCore = new RuntimeCoreCode()
    /** 运行时事件注册 */
    readonly runtimeEvent = new RuntimeEventCode()
    /** 运行时/编译时工具函数 */
    readonly crossDep = new CrossDepCode()

}

/** 编译时数据 */
export interface CompilationData {

    env: CompilationEnv,
    crossDep: CrossDepCode

}