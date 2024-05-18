import fs from 'fs'
import nodePath from 'path'
import {runtimeEnv} from './RuntimeEnv'
import {exceptionNames, RuntimeException, utils} from './untils'

let swCode: string

export const swCompiler = {

    /**
     * 读取 sw 模板文件
     * @param path 文件路径
     * @param encoding 文件编码
     */
    init(
        path: string = nodePath.join(__dirname, '..', 'resources', 'sw-template.js'),
        encoding: BufferEncoding = 'utf-8'
    ) {
        const content = fs.readFileSync(path, 'utf-8')
        const startIndex = content.indexOf('/* 代码区起点 */') + 12
        const endIndex = content.lastIndexOf('/* 代码区终点 */')
        swCode = content.substring(startIndex, endIndex)
    },

    /** 处理内联代码片段 */
    handleInlineCode() {
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
    }

} as const

export const _inlineCodes: {[p: string]: () =>  string} = {

    /** 插入环境变量 */
    _insertRuntimeEnv() {
        return utils.anyToSource(runtimeEnv.entries(), true, 'const')
    }

} as const