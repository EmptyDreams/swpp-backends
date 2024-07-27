import {DatabaseValue, KeyValueDatabase} from './KeyValueDatabase'

/** 运行时键值对存储器 */
export abstract class RuntimeKeyValueDatabase<T> extends KeyValueDatabase<T> {

    constructor(map?: {[p: string]: DatabaseValue<T>}) {
        super(map)
    }

    /** 构建运行时的 js 代码 */
    abstract buildJsSource(): string

}