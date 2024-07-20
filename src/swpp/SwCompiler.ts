import fs from 'fs'
import nodePath from 'path'
import {CrossDepCode} from './database/CrossDepCode'
import {RuntimeDepCode} from './database/RuntimeDepCode'
import {RuntimeEnv} from './database/RuntimeEnv'
import {SwCodeInject} from './SwCodeInject'
import {exceptionNames, RuntimeException, utils} from './untils'

export class SwCompiler {

    private swCode: string = ''

    /**
     * 读取 sw 模板文件，该函数结果会被缓存
     *
     * 执行流程：
     *
     * 1. 读取模板文件
     * 2. 截取代码区域
     * 3. 处理内联代码
     * 4. 插入用户代码
     *
     * @param runtime 环境变量
     * @param inject 需要插入的代码
     * @param path 文件路径
     * @param encoding 文件编码
     *
     * @throws Error 如果读取文件时发生意外
     * @throws RuntimeException 若存在非法的 inject key / {code: 'invalid_inject_key'}
     * @throws RuntimeException 若存在重复的 inject key / {code: 'repeat_inject_key'}
     */
    readSwCode(
        runtime: RuntimeData,
        inject: SwCodeInject,
        path: string = nodePath.join(__dirname, '..', 'resources', 'sw-template.js'),
        encoding: BufferEncoding = 'utf-8'
    ): string {
        if (this.swCode) return this.swCode
        runtime.runtimeDep.fixDepFunction()
        const content = fs.readFileSync(path, encoding)
        const startIndex = content.indexOf('/* 代码区起点 */') + 12
        const endIndex = content.lastIndexOf('/* 代码区终点 */')
        this.swCode = content.substring(startIndex, endIndex)
        this.swCode = handleInlineCode(runtime, this.swCode)
        this.swCode = inject.handleCode(this.swCode)
        return this.swCode
    }

}

export interface RuntimeData {

    runtimeEnv: RuntimeEnv,
    runtimeDep: RuntimeDepCode,
    crossDep: CrossDepCode

}

/** 处理内联代码片段 */
function handleInlineCode(runtime: RuntimeData, swCode: string): string {
    return swCode.replaceAll(/_inlineCodes\.(.*?)\(\)/g, (_, key) => {
        if (!(key in _inlineCodes)) {
            throw {
                code: exceptionNames.invalidInlineCodeKey,
                message: `SW 模板中的内联代码键[_inlineCodes.${key}]不存在`
            } as RuntimeException
        }
        // @ts-ignore
        return _inlineCodes[key](runtime)
    }).replaceAll(/\$\$has_runtime_env\('(.*?)'\)/g, (_, key) => {
        return runtime.runtimeEnv.has(key) ? 'true' : 'false'
    })
}

export const _inlineCodes = {

    /** 插入环境变量 */
    _insertRuntimeEnv(runtime?: RuntimeData) {
        if (runtime == null) throw {
            code: exceptionNames.nullPoint,
            message: 'runtime 不应当为空'
        } as RuntimeException
        return utils.anyToSource(runtime!.runtimeEnv.entries(), true, 'const')
    },

    /** 插入运行时依赖函数 */
    _insertDepCode(runtime?: RuntimeData) {
        if (runtime == null) throw {
            code: exceptionNames.nullPoint,
            message: 'runtime 不应当为空'
        } as RuntimeException
        const map = utils.objMap(runtime.crossDep.entries(), item => item.runOnBrowser)
        Object.assign(map, runtime.runtimeDep.entries())
        return utils.anyToSource(map, false, 'const')
    }

} as const