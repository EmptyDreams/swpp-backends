import {fetchFile, warn} from './Utils'

let _oldJson: UpdateJson | undefined | null = undefined

/**
 * 加载版本文件
 *
 * **调用该函数前必须调用过 [loadRules]**
 */
export async function loadUpdateJson(url: string): Promise<UpdateJson | null> {
    if (_oldJson !== undefined) return _oldJson
    const response = await fetchFile(url)
    if (response.status === 404) {
        warn('LoadUpdateJson', `拉取 ${url} 时出现 404 错误，如果您是第一次构建请忽略这个警告。`)
        return _oldJson = null
    }
    return _oldJson = (await response.json()) as UpdateJson
}

/**
 * 读取最后一次加载的版本文件
 *
 * **调用该函数前必须调用过 [loadUpdateJson]**
 * **调用该函数前必须调用过 [loadRules]**
 */
export function readUpdateJson(): UpdateJson | null {
    if (_oldJson === undefined) throw 'UpdateJson 未初始化'
    return _oldJson
}

export interface UpdateJson {
    global: number,
    info: VersionInfo[]
}

export interface VersionInfo {
    version: number,
    change?: ChangeExpression[]
}

export interface ChangeExpression {
    flag: string,
    value: string | string[]
}