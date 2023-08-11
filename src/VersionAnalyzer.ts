import {deepFreeze} from './Utils'
import {writeVariant, readNewVersionJson, readOldVersionJson, readEvent} from './Variant'

/**
 * 分析两个版本信息的不同
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **调用该函数前必须调用过 [buildVersionJson]**
 */
export function analyzeVersion(): AnalyzeResult {
    const extraUrl: Set<string> = readEvent('refreshUrl')
    writeVariant('refreshUrl', false)
    const newVersion = readNewVersionJson()
    const oldVersion = readOldVersionJson()
    const result: AnalyzeResult = {
        force: false,
        deleted: [],
        variational: [],
        refresh: [],
        rules: {
            add: [] as string[],
            remove: [] as string[]
        }
    }
    if (!oldVersion) return result
    if (newVersion.version !== oldVersion.version) {
        result.force = true
        return result
    }
    for (let url in oldVersion.list) {
        if (extraUrl!.has(url)) {
            result.refresh.push(url)
            extraUrl!.delete(url)
            continue
        }
        const oldValue = oldVersion.list[url]
        const newValue = newVersion.list[url]
        if (!newValue) {
            result.deleted.push(url)
            continue
        }
        const oldType = typeof oldValue
        const newType = typeof newValue
        if (oldType !== newType) {
            if (newType === 'string')
                result.rules.remove.push(url)
            else
                result.rules.add.push(url)
        } else if (oldType === 'string' && newValue !== oldValue) {
            result.variational.push(url)
        }
    }
    extraUrl!.forEach(url => result.refresh.push(url))
    return writeVariant('swppAnalyze', deepFreeze(result))
}

/** 手动添加一个要刷新的 URL */
export function refreshUrl(url: string) {
    readEvent<Set<string>>('refreshUrl').add(url)
}

export interface AnalyzeResult {
    /** 是否强制刷新所有缓存 */
    force: boolean,
    /** 被删除的 URL */
    deleted: string[],
    /** 内容变化的 URL */
    variational: string[],
    /** 手动刷新的 URL */
    refresh: string[],
    /** 因 stable 规则变化导致数据变动的 URL */
    rules: {
        /** 新规则将其识别为 stable */
        add: string[],
        /** 新规则将其识别为非 stable */
        remove: string[]
    }
}