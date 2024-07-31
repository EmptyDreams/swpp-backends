import {CompilationData} from './SwCompiler'
import {utils} from './untils'

export class JsonBuilder {

    constructor(
        private compilation: CompilationData,
        private urls: Set<string>,
        private headers: Map<string, TrackerHeaderDiff> = new Map(),
        private map: Map<string, string> = new Map()
    ) { }

    update(key: string, value: string) {
        this.map.set(key, value)
    }

    putHeader(key: string, value: TrackerHeaderDiff) {
        this.headers.set(key, value)
    }

    async buildJson(): Promise<UpdateJson> {
        const json = await this.compilation.compilationEnv.read('VERSION_FILE')()
        if (json.info.length == 0) {
            json.info.push({version: 1})
            return json
        }
        const newChange = createUpdateChangeExps(this.urls, this.map.values())
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
        const indexes = new Set<number>()   // 统计匹配过的 URL
        let htmlCount = 0   // 统计匹配的 HTML 的数量
        json.info[0].change?.forEach(item => {
            const matcher = matchUpdateRule.runOnNode(item)
            utils.findValueInIterable(this.urls, url => !!matcher(url))
                .forEach(it => {
                    indexes.add(it.index)
                    if (/(\/|\.html)$/.test(it.value)) ++htmlCount
                })
        })
        if (htmlCount > 0) {    // 如果 HTML 更新数量超过阈值，则直接清除所有 HTML 的缓存
            const htmlLimit = this.compilation.compilationEnv.read('JSON_HTML_LIMIT')
            if (htmlLimit > 0 && htmlCount > htmlLimit) {
                json.info[0].change!.unshift({flag: 'html'})
                utils.findValueInIterable(this.urls, url => /(\/|\.html)$/.test(url))
                    .forEach(it => indexes.add(it.index))
            }
        }
        /**
         * 压缩一个表达式
         * @param set 已匹配的链接
         * @param info 要压缩的表达式所在的 change[]
         * @param index 要压缩的表达式在 change[] 中的下标
         * @param addToSet 是否要把本次匹配到的内容放入到 set 中
         */
        const zipExp = (
            set: Set<number>, info: UpdateJson['info'][number], index: number, addToSet: boolean
        ) => {
            const change = info.change![index]
            const values = change.value ? (Array.isArray(change.value) ? change.value : [change.value]) : []
            const tmpChange: UpdateChangeExp = {
                flag: change.flag,
                value: ''
            }
            for (let j = values.length - 1; j >= 0; j--) {
                tmpChange.value = values[j]
                const matcher = matchUpdateRule.runOnNode(tmpChange)
                const matchIndex = utils.findValueInIterable(this.urls, url => !!matcher(url))
                let everyExists = true
                for (let item of matchIndex) {
                    if (!set.has(item.index)) {
                        everyExists = false
                        if (addToSet) set.add(item.index)
                    }
                }
                // 如果所有匹配到的内容均已存在则将本条 value 删除
                if (everyExists) values.splice(j, 1)
            }
            if (values.length == 0) delete info.change
            else if (values.length == 1) change.value = values[0]
            else change.value = values
        }
        // 压缩首个版本信息
        if (json.info[0].change) {
            const indexRecord = new Set<number>()
            for (let i = 0; i < json.info[0].change.length; i++) {
                zipExp(indexRecord, json.info[0], i, true)
            }
        }
        // 压缩历史版本信息
        for (let i = 1; i < json.info.length; i++) {
            const changes = json.info[i].change
            if (!changes) continue
            for (let k = changes.length - 1; k >= 0; k--) {
                zipExp(indexes, json.info[i], k, false)
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