import {utils} from '../untils'
import {buildEnv, KeyValueDatabase} from './KeyValueDatabase'

/** 判断是否是一个合法的 HTTP header 名称 */
function isLegalHeaderName(name: string): boolean {
    return /^[a-zA-Z0-9-]+$/.test(name)
}

/** 环境变量存储器 */
export class RuntimeEnv extends KeyValueDatabase<any> {

    constructor() {
        super({
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
                default: '/update.json'
            }),
            /** 检查更新的最短时间间隔 */
            UPDATE_CD: buildEnv({
                default: 600000
            })
        })
    }

}