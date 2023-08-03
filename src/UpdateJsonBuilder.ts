import {readMergeVersionMap} from './FileAnalyzer'
import {readRules} from './SwppRules'
import {fetchFile, warn} from './Utils'
import {AnalyzerResult} from './VersionAnalyzer'

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
 * **调用该函数前必须调用过 [loadRules]**
 * **调用该函数前必须调用过 [loadUpdateJson]**
 */
export function readUpdateJson(): UpdateJson | null {
    if (_oldJson === undefined) throw 'UpdateJson 未初始化'
    return _oldJson
}

/**
 * 构建新的 update json
 * @param root 网站根路径（包括网络协议）
 * @param dif 网站文件变化
 */
function buildNewInfo(root: string, dif: AnalyzerResult): UpdateJson {
    const rules = readRules().config
    if (!rules.json) throw '功能未开启'
    const old = readUpdateJson()
    let global = old?.global ?? 0
    if (dif.force) return {
        global: global + 1,
        info: [{
            version: old ? old.info[0].version + 1 : 0
        }]
    }
    const change: ChangeExpression[] = []
    const info: VersionInfo = {
        version: old ? old.info[0].version + 1 : 0,
        change
    }
    const list = [...dif.refresh, ...dif.deleted, ...dif.variational, ...dif.rules.remove]
    const records = {
        merge: new Set<string>(),
        html: new Set<string>()
    }
    for (let url of list) {
        if (url.startsWith('/')) {
            // 本地链接
            const merge = rules.json.merge.find(it => url.startsWith(`/${it}/`))
            if (merge) {
                records.merge.add(merge)
                continue
            }
            url = root + url
        }
        if (/(\/|\.html)$/.test(url)) { // is html
            records.html.add(getShorthand(url, 1))
        } else {    // not html
            change.push({
                flag: 'end',
                value: getShorthand(url)
            })
        }
    }
    if (records.merge.size !== 0) {
        change.push({
            flag: 'begin',
            value: Array.from(records.merge).map(it => `/${it}/`)
        })
    }
    return {
        global,
        info: [info, ...(old?.info ?? [])]
    }
}

/** 获取 URL 的缩写形式 */
export function getShorthand(url: string, offset: number = 0): string {
    const map = readMergeVersionMap()
    let collide = new Set<string>()
    for (let mapKey in map) {
        collide.add(mapKey)
    }
    let index = Math.max(url.lastIndexOf('/', url.length - offset - 1), url.length - 20)
    let result: string
    while (true) {
        result = url.substring(index)
        let count = 0
        const removeSet = new Set<string>()
        for (let url of collide) {
            if (url.endsWith(result)) {
                ++count
                if (count === 2) break
            } else {
                removeSet.add(url)
            }
        }
        switch (count) {
            case 1: return result
            case 2:
                --index
                removeSet.forEach(it => collide.delete(it))
                break
            default:
                throw '意料之外的错误：' + count
        }
    }
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
    flag: 'html' | 'page' | 'end' | 'begin' | 'str' | 'reg',
    value: string | string[]
}