import {readMergeVersionMap} from './FileAnalyzer'
import {readRules} from './SwppRules'
import {fetchFile, warn} from './Utils'
import {AnalyzeResult} from './VersionAnalyzer'

let _oldJson: UpdateJson | undefined | null = undefined
const externalChange: ChangeExpression[] = []

/** 提交修改 */
export function submitChange(...change: ChangeExpression[]) {
    externalChange.push(...change)
}

/**
 * 加载版本文件
 *
 * + **调用该函数前必须调用过 [loadRules]**
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
 * + **调用该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadUpdateJson]**
 */
export function readUpdateJson(): UpdateJson | null {
    if (_oldJson === undefined) throw 'UpdateJson 未初始化'
    return _oldJson
}

/**
 * 构建新的 update json
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 *
 * @param root 网站根路径（包括网络协议）
 * @param dif 网站文件变化
 */
export function buildNewInfo(root: string, dif: AnalyzeResult): UpdateJson {
    const config = readRules().config.json
    if (!config) throw '功能未开启'
    const old = readUpdateJson()
    let global = old?.global ?? 0
    if (dif.force) return {
        global: global + 1,
        info: [{
            version: old ? old.info[0].version + 1 : 0
        }]
    }
    const change: ChangeExpression[] = []
    const info: UpdateVersionInfo = {
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
            const merge = config.merge.find(it => url.startsWith(`/${it}/`))
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
    if (records.html.size !== 0) {
        if (records.html.size > config.maxHtml) {
            change.push({flag: 'html'})
        } else {
            change.push({
                flag: 'end',
                value: Array.from(records.html)
            })
        }
    }
    if (records.merge.size !== 0) {
        change.push({
            flag: 'begin',
            value: Array.from(records.merge).map(it => `/${it}/`)
        })
    }
    change.push(...externalChange)
    return zipJson({
        global,
        info: [info, ...(old?.info ?? [])]
    })
}

function zipJson(json: UpdateJson): UpdateJson {
    const record = new Map<FlagStr, string[]>()
    /** 合并同名项目 */
    function merge(info: UpdateVersionInfo) {
        const localRecord = new Map<FlagStr, Set<string>>()
        if (!info.change) return
        for (let exp of info.change) {
            const value = exp.value
            if (!localRecord.has(exp.flag))
                localRecord.set(exp.flag, new Set())
            if (!value) continue
            const set = localRecord.get(exp.flag)!
            if (typeof value === 'string') {
                set.add(value)
            } else {
                value.forEach(it => set.add(it))
            }
        }
        type FunResult = [FlagStr, string[]]
        info.change = Array.from(localRecord)
            .map(it => {
                if (it[0] === 'html') return [it[0], []] as FunResult
                const values = Array.from(it[1])
                if (it[0] === 'str' || it[0] === 'reg') return [it[0], values] as FunResult
                const filtered = values.filter((value, index) => {
                    if (it[0] === 'end' && record.has('html') && /(\/|\.html)$/.test(value))
                        return false
                    for (let i = 0; i < values.length; i++) {
                        if (i === index) continue
                        const that = values[i]
                        switch (it[0]) {
                            case 'end':
                                if (value.endsWith(that)) return false
                                break
                            case 'begin':
                                if (value.startsWith(that)) return false
                                break
                        }
                    }
                    return true
                })
                return [it[0], filtered] as FunResult
            }).filter(it => it[1].length !== 0 || it[0] === 'html')
            .map(it => {
                record.set(it[0], it[1])
                if (it[1].length === 0) return { flag: it[0] }
                return {
                    flag: it[0],
                    value: it[1].length === 1 ? it[1][0] : it[1]
                }
            })
    }
    /** 移除不可达的表达式 */
    function deleteUnreachableExp(list: UpdateVersionInfo[]) {
        for (let i = list.length - 1; i > 0; i--) {
            const info = list[i]
            let change = info.change
            if (!change) continue
            for (let k = 0; k < change.length; k++) {
                const exp = change[k]
                const top = record.get(exp.flag)
                if (exp.flag === 'html') {
                    change.splice(k--, 1)
                    continue
                }
                let array = typeof exp.value === 'string' ? [exp.value] : exp.value!
                const find = (test: (it: string) => boolean) => {
                    if (!top) return false
                    return top.find(test)
                }
                switch (exp.flag) {
                    case 'end':
                        array = array.filter(value => {
                            if (/(\/|\.html)$/.test(value) && record.has('html'))
                                return false
                            if (!top) return true
                            return !find(it => value.endsWith(it))
                        })
                        break
                    case 'begin':
                        array = array.filter(value => !find(it => value.startsWith(it)))
                        break
                    case 'str':
                        array = array.filter(value => !find(it => value.includes(it)))
                        break
                    case 'reg':
                        array = array.filter(value => !top?.includes(value))
                        break
                }
                switch (array.length) {
                    case 0:
                        change.splice(k--, 1)
                        break
                    case 1:
                        exp.value = array[0]
                        break
                    default:
                        exp.value = array
                        break
                }
            }
            if (change.length === 0)
                delete info.change
        }
    }
    merge(json.info[0])
    deleteUnreachableExp(json.info)
    return json
}

/**
 * 获取 URL 的缩写形式
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **调用该函数前必须调用过 [loadCacheJson]**
 * + **执行该函数前必须调用过 [buildVersionJson]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
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
    info: UpdateVersionInfo[]
}

export interface UpdateVersionInfo {
    version: number,
    change?: ChangeExpression[]
}

export interface ChangeExpression {
    flag: FlagStr,
    value?: string | string[]
}

export type FlagStr = 'html' | 'end' | 'begin' | 'str' | 'reg'