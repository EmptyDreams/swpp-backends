import {UpdateChangeExp} from '../JsonBuilder'
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

export type COMMON_TYPE_CROSS_DEP = ReturnType<typeof buildCommon>

/**
 * 运行时和生成时都依赖的代码
 */
export class CrossDepCode extends RuntimeKeyValueDatabase<FunctionInBrowserAndNode<any, any>, COMMON_TYPE_CROSS_DEP> {

    constructor() {
        super(buildCommon())
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        const map = utils.objMap(this.entries(), item => item.runOnBrowser)
        return utils.anyToSource(map, false, 'const')
    }

}

function buildCommon() {
    return {
        /** 缓存规则 */
        matchCacheRule: {
            default: buildFunction({
                runOnBrowser: (_url: URL): undefined | null | false | number => false,
                runOnNode(_url: URL): undefined | null | false | number {
                    return this.runOnBrowser(_url)
                }
            })
        },
        /** 匹配缓存更新规则 */
        matchUpdateRule: {
            default: buildFunction({
                runOnBrowser: (exp: UpdateChangeExp): (url: string) => boolean|undefined|null => {
                    /**
                     * 遍历所有value
                     * @param action 接受value并返回bool的函数
                     * @return 如果 value 只有一个则返回 `action(value)`，否则返回所有运算的或运算（带短路）
                     */
                    const forEachValues = (action: (value: string) => boolean): boolean => {
                        const value = exp.value!
                        if (Array.isArray(value)) {
                            for (let it of value) {
                                if (action(it)) return true
                            }
                            return false
                        } else return action(value)
                    }
                    switch (exp.flag) {
                        case 'html':
                            return url => /\/$|\.html$/.test(url)
                        case 'suf':
                            return url => forEachValues(value => url.endsWith(value))
                        case 'pre':
                            return url => forEachValues(value => url.startsWith(value))
                        case 'str':
                            return url => forEachValues(value => url.includes(value))
                        case 'reg':
                            return url => forEachValues(value => new RegExp(value, 'i').test(url))
                        default:
                            throw exp
                    }
                },
                runOnNode(exp): (url: string) => boolean|undefined|null {
                    return this.runOnBrowser(exp)
                }
            })
        }
    } as const
}

function buildFunction<Args extends any[], R>(
    fun: FunctionInBrowserAndNode<Args, R>
): FunctionInBrowserAndNode<Args, R> {
    return fun
}