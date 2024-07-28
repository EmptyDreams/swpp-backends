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

function xxx(urls: Set<string>, refresh: Set<string>): UpdateChangeExp[] {
    return [
        {
            flag: 'pre',
            value: 'https://asdf'
        },
        {
            flag: 'suf',
            value: 'a.js'
        }
    ]
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