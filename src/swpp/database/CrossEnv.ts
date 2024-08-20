import nodePath from 'path'
import {defineLazyInitConfig} from '../config/ConfigCluster'
import {exceptionNames, RuntimeException, utils} from '../untils'
import {buildEnv} from './KeyValueDatabase'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

/** 判断是否是一个合法的 HTTP header 名称 */
function isLegalHeaderName(name: string): boolean {
    return /^[a-zA-Z0-9-]+$/.test(name)
}

export type COMMON_TYPE_CROSS_ENV = ReturnType<typeof buildCommon>

/** 环境变量存储器 */
export class CrossEnv extends RuntimeKeyValueDatabase<any, COMMON_TYPE_CROSS_ENV> {

    constructor() {
        super('CrossEnv', buildCommon(), (key, value) => {
            if (typeof value === 'function') {
                throw new RuntimeException(
                    exceptionNames.invalidVarType,
                    `crossEnv[${key}] 应当返回一个非函数`, {value: value.toString()}
                )
            }
        })
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        return utils.anyToSource(this.entries(), true, 'const')
    }

}

function buildCommon() {
    return {
        /** 缓存库名称 */
        CACHE_NAME: buildEnv({default: 'kmarBlogCache'}),
        /** 存储版本号的 URL */
        VERSION_PATH: buildEnv({
            default: 'https://id.v3/',
            checker(value) {
                if (!utils.checkUrl(value)) {
                    return {value, message: '填写的 URL 不合法'}
                }
                if (!value.endsWith('/')) {
                    return {value, message: '填写的 URL 应当以“/”结尾'}
                }
                return false
            }
        }),
        /** 逃生门版本号 */
        ESCAPE: buildEnv({default: 0}),
        /** 存储失效信息的头名称 */
        INVALID_KEY: buildEnv({
            default: 'X-Swpp-Invalid',
            checker(value) {
                if (!isLegalHeaderName(value)) {
                    return {value, message: '填写的 key 值是非法的 header 名称'}
                }
                return false
            }
        }),
        /** 存储入库时间的头名称 */
        STORAGE_TIMESTAMP: buildEnv({
            default: 'X-Swpp-Time',
            checker(value) {
                if (!isLegalHeaderName(value)) {
                    return {value, message: '填写的 key 值是非法的 header 名称'}
                }
                return false
            }
        }),
        /** 版本文件所在目录 */
        UPDATE_JSON_URL: buildEnv({
            default: defineLazyInitConfig((_, compilation) => {
                const info = compilation.compilationEnv.read('SWPP_JSON_FILE')
                return nodePath.posix.join(info.swppPath, info.versionPath)
            }),
            checker(value: string) {
                if (this.manual) return {value, message: '不应当手动设置该项！'}
                return false
            }
        }),
        /** 检查更新的最短时间间隔 */
        UPDATE_CD: buildEnv({
            default: 600000
        })
    } as const
}