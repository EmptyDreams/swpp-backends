import {CompilationData} from './SwCompiler'
import {utils} from './untils'

export class JsonBuilder {

    constructor(
        private compilation: CompilationData,
        private urls: Set<string>,
        private map: Map<string, string> = new Map()
    ) { }

    update(key: string, value: string) {
        this.map.set(key, value)
    }

    /** 将 Builder 序列化为 JSON */
    serialize(): string {
        const obj: any = {}
        this.map.forEach((value, key) => obj[key] = value)
        return JSON.stringify(obj)
    }

    // noinspection JSUnusedGlobalSymbols
    async buildJson(): Promise<UpdateJson> {
        const json = await this.compilation.compilationEnv.read('SWPP_JSON_FILE').fetchVersionFile()
        if (json.info.length == 0) {
            json.info.push({version: 1})
            return json
        }
        const newChange = createUpdateChangeExps(this.urls, this.map.keys())
        json.info.unshift({
            version: json.info[0].version + 1,
            change: [newChange]
        })
        this.zipJson(json)
        this.limitJson(json)
        return json
    }

    private zipJson(json: UpdateJson) {
        const matchUpdateRule = this.compilation.crossDep.read('matchUpdateRule')
        const htmlMatcher = matchUpdateRule.runOnNode({flag: 'html'})

        // 打散新版本的所有规则
        json.info[0].change = json.info[0].change?.flatMap(exp => {
            if (!Array.isArray(exp.value)) return [exp]
            return exp.value.map(it => ({
                flag: exp.flag, value: it
            }))
        })

        // 压缩第一个版本的内容
        const indexes = (() => {
            const change = json.info[0].change
            if (!change) return new Set<number>()
            let htmlCount = 0
            const indexes = new Set<number>()
            // 统计每个表达式匹配的资源及刷新的 HTML 总量
            const indexesArray = change.map(exp => {
                const matcher = matchUpdateRule.runOnNode(exp)
                const result = new Set<number>()
                utils.findValueInIterable(this.urls, it => !!matcher(it))
                    .forEach(item => {
                        indexes.add(item.index)
                        result.add(item.index)
                        if (htmlMatcher(item.value)) ++htmlCount
                    })
                return result
            })
            // 如果 HTML 更新数量超过阈值，则直接清除所有 HTML 的缓存
            if (htmlCount > 0) {
                const htmlLimit = this.compilation.compilationEnv.read('JSON_HTML_LIMIT')
                if (htmlLimit > 0 && htmlCount > htmlLimit) {
                    change.unshift({flag: 'html'})
                    const indexes = new Set<number>()
                    utils.findValueInIterable(this.urls, it => !!htmlMatcher(it))
                        .forEach(({index}) => indexes.add(index))
                    indexesArray.unshift(indexes)
                }
            }
            // 分析哪些表达式是冗余的
            const invalidIndex = new Array<boolean>(indexesArray.length)
            for (let i = 0; i < indexesArray.length; i++) {
                if (invalidIndex[i]) continue
                const parent = indexesArray[0]
                o:for (let k = 0; k < indexesArray.length; k++) {
                    if (i == k || invalidIndex[k]) continue
                    for (let item of indexesArray[k]) {
                        if (!parent.has(item)) {
                            continue o
                        }
                    }
                    invalidIndex[k] = true
                }
            }
            // 生成新的表达式
            const validExp = new Map<UpdateChangeExp['flag'], string[]>()
            for (let i = 0; i < invalidIndex.length; i++) {
                if (invalidIndex[i]) continue
                const oldExpList = validExp.get(change[i].flag)
                const expList = oldExpList ?? []
                if (change[i].value) {
                    console.assert(typeof change[i].value == 'string', `change[${i}].value = ${change[i].value} 应当为字符串`)
                    expList.push(change[i].value as string)
                }
                if (!oldExpList) validExp.set(change[i].flag, expList)
            }
            const newChange = json.info[0].change = [] as UpdateChangeExp[]
            validExp.forEach((value, flag) => {
                switch (value.length) {
                    case 0:
                        newChange.push({flag})
                        break
                    case 1:
                        newChange.push({flag, value: value[0]})
                        break
                    default:
                        newChange.push({flag, value})
                }
            })
            return indexes
        })()

        // 移除后续表达式中冗余的内容
        if (indexes.size == 0) return
        for (let i = 1; i < json.info.length; i++) {
            const changes = json.info[i].change
            if (!changes) continue
            for (let k = changes.length - 1; k >= 0; k--) {
                const change = json.info[i].change![k]
                const values = change.value ? (Array.isArray(change.value) ? change.value : [change.value]) : []
                const tmpChange: UpdateChangeExp = {
                    flag: change.flag,
                    value: ''
                }
                for (let j = values.length - 1; j >= 0; j--) {
                    tmpChange.value = values[j]
                    const matcher = matchUpdateRule.runOnNode(tmpChange)
                    const matchIndex = utils.findValueInIterable(this.urls, url => !!matcher(url))
                    if (matchIndex.every(it => indexes.has(it.index))) {
                        values.splice(j, 1)
                    }
                }
                if (values.length == 0) delete json.info[i].change
                else if (values.length == 1) change.value = values[0]
                else change.value = values
            }
        }
    }

    private limitJson(json: UpdateJson) {
        const lengthLimit = this.compilation.compilationEnv.read('VERSION_LENGTH_LIMIT')
        if (lengthLimit == 0) return
        let sum = 0
        for (let i = 0; i < json.info.length; i++) {
            sum += JSON.stringify(json.info[i]).length
            if (sum > lengthLimit) {
                if (i == 0) json.info = [{version: json.info[0].version}]
                else json.info.splice(i)
                return
            }
        }
    }

}

/**
 * 构建更新表达式
 *
 * 具体实现为使用字典树构建最优后缀匹配表达式，时间复杂度 O(N + M)
 */
function createUpdateChangeExps(urls: ReadonlySet<string>, refresh: Iterable<string>): UpdateChangeExp {
    interface Node {
        next: (Node | undefined)[],
        flag: boolean,
        isEnd: boolean
    }

    function newNode(): Node {
        return {
            next: new Array(128),
            flag: false,
            isEnd: false
        }
    }

    const head = newNode()
    const insert = (content: string, flag: boolean) => {
        let cur = head
        for (let i = content.length - 1; i >= 0; i--) {
            const index = content.charCodeAt(i)
            if (cur.next[index]) {
                cur = cur.next[index]!
            } else {
                cur = cur.next[index] = newNode()
            }
        }
        cur.flag = flag
        cur.isEnd = true
    }
    urls.forEach(it => insert(it, false))
    for (let item of refresh) {
        insert(item, true)
    }

    function dfs(node: Node) {
        if (node.isEnd) return
        node.flag = true
        for (let next of node.next) {
            if (next) {
                dfs(next)
                node.flag = node.flag && next.flag
            }
        }
    }

    dfs(head)

    let dfs2S: string[] = []
    const result: string[] = []

    function dfs2(node: Node) {
        if (node.flag) {
            result.push(dfs2S.reduceRight((a, b) => a + b, ''))
            return
        }
        for (let i = 0; i < node.next.length; i++) {
            const next = node.next[i]
            if (next) {
                dfs2S.push(String.fromCharCode(i))
                dfs2(next)
                dfs2S.pop()
            }
        }
    }

    dfs2(head)
    return {flag: 'suf', value: result}
}

export interface TrackerHeaderDiff {

    oldValue: any
    newValue: any

}

export interface UpdateJson {

    global: number

    info: {
        version: number,
        change?: UpdateChangeExp[]
    }[]

}

export interface UpdateChangeExp {

    flag: 'html' | 'suf' | 'pre' | 'str' | 'reg'
    value?: string | string[]

}