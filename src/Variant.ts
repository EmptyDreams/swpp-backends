import exp from 'constants'
import {type} from 'os'
import {VersionJson, VersionMap} from './FileAnalyzer'
import {SwppRules} from './SwppRules'
import {UpdateJson} from './UpdateJsonBuilder'
import {deepFreeze, error} from './Utils'
import {AnalyzeResult} from './VersionAnalyzer'

const map = new Map<string, any>()

/** 创建一个变量 */
export function writeVariant<T>(key: string, value: T): T {
    map.set(key, value)
    return value
}

/** 读取一个变量 */
export function readVariant(key: string) {
    return map.get(key)
}

/** 移除一个变量 */
export function deleteVariant(key: string) {
    map.delete(key)
}

/**
 * 读取最后一次构建的 rules
 *
 * **执行该函数前必须调用过 [loadRules]**
 */
export function readRules(): SwppRules {
    return readLoadedData('swppRules', 'RulesReader', '规则文件')
}

/**
 * 读取最后一次加载的 version json
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 */
export function readOldVersionJson(): VersionJson | null {
    return readLoadedData('oldVersionJson', 'OldVersionReader', 'version json')
}

/**
 * 读取最后一次构建的 VersionJson
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function readNewVersionJson(): VersionJson {
    return readLoadedData('newVersionJson', 'NewVersionReader', 'version json')
}

/**
 * 读取新旧版本文件合并后的版本地图
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function readMergeVersionMap(): VersionMap {
    const key = 'mergeVersionMap'
    const cache = readVariant(key)
    if (cache) return cache
    const map: VersionMap = {}
    Object.assign(map, readOldVersionJson()?.list ?? {})
    Object.assign(map, readNewVersionJson().list)
    writeVariant(key, deepFreeze(map))
    return map
}

/**
 * 读取最后一次加载的版本文件
 *
 * + **调用该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadUpdateJson]**
 */
export function readUpdateJson(): UpdateJson | null {
    return readLoadedData('oldUpdateJson', 'OldUpdateJsonReader', 'update json')
}

/**
 * 读取分析结果
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **调用该函数前必须调用过 [analyze]**
 */
export function readAnalyzeResult(): AnalyzeResult {
    return readLoadedData('swppAnalyze', 'AnalyzeResultReader', 'analyze result')
}

/** 读取一个事件 */
export function readEvent<T>(key: string): T {
    return readLoadedData(key, key[0].toUpperCase() + key.substring(1), key)
}

function readLoadedData(key: string, type: string, name: string): any {
    const item = readVariant(key)
    switch (item) {
        case undefined:
            error(type, `${name} 尚未初始化`)
            throw name
        case false:
            error(type, `${name} 事件周期已经结束`)
            throw name
        default:
            return item
    }
}