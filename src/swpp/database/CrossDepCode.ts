import {KeyValueDatabase} from './KeyValueDatabase'
import {FunctionInBrowser} from './RuntimeDepCode'

/**
 * 同时在 Node 和浏览器中运行的代码
 */
export interface FunctionInBrowserAndNode<Args extends any[], R> {

    runOnBrowser: FunctionInBrowser<Args, R>

    runOnNode: (...args: Args) => R

}

/**
 * 运行时和生成时都依赖的代码
 */
export class CrossDepCode extends KeyValueDatabase<FunctionInBrowserAndNode<any, any>> {

    constructor() {
        super({
            /** 缓存规则 */
            matchCacheRule: {
                default: buildFunction({
                    runOnBrowser: (url: URL): undefined | null | false | number => false,
                    runOnNode: (url: URL): undefined | null | false | number => false
                })
            }
        })
    }

}

function buildFunction<Args extends any[], R>(
    fun: FunctionInBrowserAndNode<Args, R>
): FunctionInBrowserAndNode<Args, R> {
    return fun
}