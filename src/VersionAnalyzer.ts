import {readVersionJson, VersionJson} from './FileAnalyzer'

const extraUrl = new Set<string>()

/**
 * 分析两个版本信息的不同
 *
 * **调用该函数前必须调用过 [loadCacheJson]**
 *
 * @param version 新的版本信息
 */
export function analyzer(version: VersionJson): AnalyzerResult {
    const oldVersion = readVersionJson()
    const result: AnalyzerResult = {
        force: false,
        deleted: [],
        variational: [],
        refresh: [],
        rules: {
            add: [] as string[],
            remove: [] as string[]
        }
    }
    if (version.version !== oldVersion.version) {
        result.force = true
        return result
    }
    for (let url in oldVersion.list) {
        if (extraUrl.has(url)) {
            result.refresh.push(url)
            extraUrl.delete(url)
            continue
        }
        const oldValue = oldVersion.list[url]
        const newValue = version.list[url]
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
    extraUrl.forEach(url => result.refresh.push(url))
    return result
}

/** 手动添加一个要刷新的 URL */
export function refreshUrl(url: string) {
    extraUrl.add(url)
}

export interface AnalyzerResult {
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