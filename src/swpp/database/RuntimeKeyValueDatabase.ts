import {DatabaseValue, KeyValueDatabase} from './KeyValueDatabase'

/** 运行时键值对存储器 */
export abstract class RuntimeKeyValueDatabase<T, C extends Record<string, DatabaseValue<T>>> extends KeyValueDatabase<T, C> {

    protected constructor(namespace: string, map?: C, globalChecker?: (key: string, value: T) => void) {
        super(namespace, map, globalChecker)
    }

    /** 构建运行时的 js 代码 */
    abstract buildJsSource(): string

}