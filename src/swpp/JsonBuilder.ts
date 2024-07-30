import {CompilationData} from './SwCompiler'

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

    private buildSrcJson(): UpdateJson {
        const meta = {
            version: -1,
            change: []
        }
        const json = {
            global: 0,
            info: [meta]
        }

        return json
    }

}

export function createUpdateChangeExps(urls: Set<string>, refresh: Set<string>): UpdateChangeExp[] {
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
    refresh.forEach(it => insert(it, true))

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
    const result: UpdateChangeExp[] = []

    function dfs2(node: Node) {
        if (node.flag) {
            result.push({
                flag: 'suf',
                value: dfs2S.reduceRight((a, b) => a + b, '')
            })
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
    return result
}

export interface TrackerHeaderDiff {

    oldValue: any
    newValue: any

}

export interface UpdateJson {

    global: number

    info: {
        version: number,
        change: UpdateChangeExp[]
    }[]

}

export interface UpdateChangeExp {

    flag: 'html' | 'suf' | 'pre' | 'str' | 'reg'
    value: string | string[]

}