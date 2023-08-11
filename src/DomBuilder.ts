import fs from 'fs'
import nodePath from 'path'
import {error} from './Utils'
import {readRules} from './Variant'

/**
 * 构建 DOM 端的 JS 文件
 *
 * + **执行该函数前必须调用过 [loadRules]**
 */
export function buildDomJs(): string {
    const config = readRules().config.dom
    if (!config) {
        error('DomJsBuilder', '该配置项未开启')
        throw '功能未开启'
    }
    let template = fs.readFileSync(nodePath.resolve('./', module.path, 'resources/sw-dom.js'), 'utf-8')
    if (config.onsuccess)
        template = template.replaceAll('// ${onSuccess}', `(${config.onsuccess.toString()})()`)
    return template
}