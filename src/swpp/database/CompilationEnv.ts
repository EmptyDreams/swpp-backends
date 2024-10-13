import {defineLazyInitConfig} from '../config/ConfigCluster'
import {UpdateJson} from '../JsonBuilder'
import {FiniteConcurrencyFetcher} from '../NetworkFileHandler'
import {FileUpdateTracker} from '../ResourcesScanner'
import {CompilationData} from '../SwCompiler'
import {utils} from '../untils'
import {buildEnv, KeyValueDatabase, readThisValue, RuntimeEnvErrorTemplate} from './KeyValueDatabase'

export type COMMON_TYPE_COMP_ENV = ReturnType<typeof buildCommon>

/**
 * 仅在编译期生效的配置项
 */
export class CompilationEnv extends KeyValueDatabase<any, COMMON_TYPE_COMP_ENV> {

    constructor() {
        super('CompilationEnv')
        this.lazyInit(buildCommon(this))
    }

}

/** 拉取版本信息和 tracker 时的 404 等级 */
export enum AllowNotFoundEnum {

    /** 允许任意形式的 404，包含 DNS 解析失败 */
    ALLOW_ALL,
    /** 允许服务器返回 404 */
    ALLOW_STATUS,
    /** 拒绝任意形式的 404 */
    REJECT_ALL

}

function buildCommon(_env: any) {
    const env = _env as CompilationEnv
    return {
        /**
         * 网站根目录
         */
        DOMAIN_HOST: buildEnv({
            default: new URL("https://www.example.com"),
            checker(value: URL): false | RuntimeEnvErrorTemplate<any> {
                if (value.host === 'www.example.com') return {
                    value, message: 'DOMAIN_HOST 必须手动设置而非使用默认值'
                }
                if (value.hash || value.search) return {
                    value, message: '传入的域名不应当包含查询参数和片段标识符'
                }
                if (value.protocol !== 'https:' && value.host !== '127.0.0.1' && value.host !== 'localhost') return {
                    value, message: '传入的 URL 必须使用 https 协议'
                }
                return false
            }
        }),
        /**
         * SW 文件生成目录（'sw'），不需要包含 js 拓展名
         */
        SERVICE_WORKER: buildEnv({
            default: 'sw',
            checker(value: string): false | RuntimeEnvErrorTemplate<any> {
                return value.endsWith('.js') ? {
                    value, message: 'SW 文件名不需要包含拓展名'
                } : false
            }
        }),
        /**
         * HTML 数量限制，设置为 <= 0 表示不限制（`0`）
         */
        JSON_HTML_LIMIT: buildEnv({
            default: 0
        }),
        /**
         * 版本信息长度限制（`1024`）
         */
        VERSION_LENGTH_LIMIT: buildEnv({
            default: 1024,
            checker(value: number): false | RuntimeEnvErrorTemplate<any> {
                if (value < 0) return {
                    value, message: '版本信息长度限制不应当小于零'
                }
                if (value == 0) {
                    utils.printWarning('ENV', '版本信息长度设置为 0 将完全禁止长度限制，这将导致长度无限增长。')
                }
                return false
            }
        }),
        /**
         * swpp 的 JSON 文件的基本信息
         */
        SWPP_JSON_FILE: buildEnv({
            default: {
                swppPath: 'swpp',
                trackerPath: 'tracker.json',
                versionPath: 'update.json',
                async fetchVersionFile(): Promise<UpdateJson> {
                    const baseUrl = env.read('DOMAIN_HOST')
                    const fetcher = env.read('NETWORK_FILE_FETCHER')
                    const isNotFound = env.read('isNotFound')
                    try {
                        const swppPath = readThisValue(this, 'swppPath')
                        const versionPath = readThisValue(this, 'versionPath')
                        const response = await fetcher.fetch(utils.splicingUrl(baseUrl, swppPath, versionPath))
                        if (!isNotFound.response(response)) {
                            const json = await response.json()
                            return json as UpdateJson
                        }
                    } catch (e) {
                        if (!isNotFound.error(e)) throw e
                    }
                    return {global: 0, info: []}
                },
                async fetchTrackerFile(compilation: CompilationData): Promise<FileUpdateTracker> {
                    return await FileUpdateTracker.parserJsonFromNetwork(compilation)
                }
            }
        }),
        /**
         * 读取一个本地文件
         */
        readLocalFile: buildEnv({
            default: utils.readFileUtf8
        }),
        /**
         * 拉取网络文件
         */
        NETWORK_FILE_FETCHER: buildEnv({
            default: new FiniteConcurrencyFetcher()
        }),
        /**
         * 判断文件是否是 404
         */
        isNotFound: buildEnv({
            default: {
                response: (response: Response) => response.status == 404,
                error: (err: any) => err?.cause?.code === 'ENOTFOUND'
            }
        }),
        /**
         * 是否允许 404
         */
        ALLOW_NOT_FOUND: buildEnv({
            default: AllowNotFoundEnum.ALLOW_STATUS,
            checker(value: AllowNotFoundEnum): false | RuntimeEnvErrorTemplate<any> {
                switch (value) {
                    case AllowNotFoundEnum.ALLOW_ALL:
                    case AllowNotFoundEnum.ALLOW_STATUS:
                    case AllowNotFoundEnum.REJECT_ALL:
                        return false
                    default:
                        return {value, message: '填写了非法的 ALLOW_NOT_FOUND 值'}
                }
            }
        }),
        /**
         * 检查一个链接是否是稳定的（也就是 URL 不变其返回的结果永远不变）
         */
        isStable: buildEnv({
            default: (_url: URL): boolean => false
        })
    } as const
}