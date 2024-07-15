import fs from 'fs'
import nodePath from 'path'
import {CompilationEnv} from './database/CompilationEnv'

/**
 * 资源文件扫描器
 */
export class ResourcesScanner {

    constructor(private env: CompilationEnv) { }

    /** 扫描指定目录下的所有文件 */
    scanLocalFile(path: string) {
        const reader = this.env.read('LOCAL_FILE_READER') as (path: string) => string
        traverseDirectory(path, file => {
            if (file.endsWith('.html')) {
                this.scanHtmlFile(reader(file))
            }
        })
    }

    scanHtmlFile(content: string) {

    }

}

/**
 * 遍历目录下的所有文件
 * @param dir
 * @param callback
 */
function traverseDirectory(dir: string, callback: (file: string) => void) {
    const stats = fs.lstatSync(dir)
    if (stats.isDirectory()) {
        fs.readdirSync(dir).forEach(value => traverseDirectory(value, callback))
    } else {
        callback(dir)
    }
}