import {utils} from '../untils'
import {FunctionInBrowser} from './RuntimeDepCode'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

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
export class CrossDepCode extends RuntimeKeyValueDatabase<FunctionInBrowserAndNode<any, any>> {

    constructor() {
        super({
            /** 缓存规则 */
            matchCacheRule: {
                default: buildFunction({
                    runOnBrowser: (_url: URL): undefined | null | false | number => false,
                    runOnNode(_url: URL): undefined | null | false | number {
                        return this.runOnBrowser(_url)
                    }
                })
            }
        })
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        const map = utils.objMap(this.entries(), item => item.runOnBrowser)
        return utils.anyToSource(map, false, 'const')
    }

}

function buildFunction<Args extends any[], R>(
    fun: FunctionInBrowserAndNode<Args, R>
): FunctionInBrowserAndNode<Args, R> {
    return fun
}