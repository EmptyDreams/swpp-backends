import fs from 'fs'
import nodePath from 'path'
import {runtimeEnv} from './RuntimeEnv'
import {exceptionNames, RuntimeException, utils} from './untils'

export class SwCompiler {

    private swCode: string = ''

    /**
     * 读取 sw 模板文件，该函数结果会被缓存
     * @param path 文件路径
     * @param encoding 文件编码
     */
    readSwCode(
        path: string = nodePath.join(__dirname, '..', 'resources', 'sw-template.js'),
        encoding: BufferEncoding = 'utf-8'
    ): string {
        if (this.swCode) return this.swCode
        const content = fs.readFileSync(path, encoding)
        const startIndex = content.indexOf('/* 代码区起点 */') + 12
        const endIndex = content.lastIndexOf('/* 代码区终点 */')
        this.swCode = content.substring(startIndex, endIndex)
        this.swCode = handleInlineCode(this.swCode)
        return this.swCode
    }

}

/** 处理内联代码片段 */
function handleInlineCode(swCode: string): string {
    if (!swCode) throw {
        code: exceptionNames.uninitialized,
        message: '未执行 init 函数初始化 sw 模板'
    } as RuntimeException
    for (let funName in _inlineCodes) {
        const fun = _inlineCodes[funName]
        const replaceKey = `_inlineCodes.${funName}()`
        const replaceValue = fun()
        swCode = swCode.replaceAll(replaceKey, replaceValue)
    }
    return swCode
}

export const _inlineCodes: { [p: string]: () => string } = {

    /** 插入环境变量 */
    _insertRuntimeEnv() {
        return utils.anyToSource(runtimeEnv.entries(), true, 'const')
    }

} as const