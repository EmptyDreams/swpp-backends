import fs from 'fs'
import nodePath from 'path'
import {RuntimeEnv} from './RuntimeEnv'
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
     * @param runtimeEnv 环境变量
     * @param inject 需要插入的代码
     * @param path 文件路径
     * @param encoding 文件编码
     *
     * @throws Error 如果读取文件时发生意外
     * @throws RuntimeException 若存在非法的 inject key / {code: 'invalid_inject_key'}
     * @throws RuntimeException 若存在重复的 inject key / {code: 'repeat_inject_key'}
     */
    readSwCode(
        runtimeEnv: RuntimeEnv,
        inject: SwCodeInject,
        path: string = nodePath.join(__dirname, '..', 'resources', 'sw-template.js'),
        encoding: BufferEncoding = 'utf-8'
    ): string {
        if (this.swCode) return this.swCode
        const content = fs.readFileSync(path, encoding)
        const startIndex = content.indexOf('/* 代码区起点 */') + 12
        const endIndex = content.lastIndexOf('/* 代码区终点 */')
        this.swCode = content.substring(startIndex, endIndex)
        this.swCode = handleInlineCode(runtimeEnv, this.swCode)
        this.swCode = inject.handleCode(this.swCode)
        return this.swCode
    }

}

/** 处理内联代码片段 */
function handleInlineCode(runtimeEnv: RuntimeEnv, swCode: string): string {
    return swCode.replaceAll(/\$\$has_runtime_env\('(.*?)'\)/g, (_, key) => {
        return runtimeEnv.has(key) ? 'true' : 'false'
    }).replaceAll(/_inlineCodes\.(.*?)\(\)/g, (_, key) => {
        if (!(key in _inlineCodes)) {
            throw {
                code: exceptionNames.invalidInlineCodeKey,
                message: `SW 模板中的内联代码键[_inlineCodes.${key}]不存在`
            } as RuntimeException
        }
        return _inlineCodes[key](runtimeEnv)
    })
}

export const _inlineCodes: { [p: string]: (runtimeEnv: RuntimeEnv) => string } = {

    /** 插入环境变量 */
    _insertRuntimeEnv(runtimeEnv: RuntimeEnv) {
        return utils.anyToSource(runtimeEnv.entries(), true, 'const')
    }

} as const

export interface IMessage {

    type: string,
    data: any

}