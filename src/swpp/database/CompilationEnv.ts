import {HTMLElement} from 'fast-html-parser'
import fs from 'fs'
import {buildFileParser, FileParserRegistry} from '../FileParser'
import {UpdateJson} from '../JsonBuilder'
import {FiniteConcurrencyFetcher} from '../NetworkFileHandler'
import {FileUpdateTracker} from '../ResourcesScanner'
import {CompilationData} from '../SwCompiler'
import {exceptionNames, RuntimeException, utils} from '../untils'
import {CrossDepCode} from './CrossDepCode'
import {CrossEnv} from './CrossEnv'
import {buildEnv, KeyValueDatabase, RuntimeEnvErrorTemplate} from './KeyValueDatabase'
import * as HTMLParser from 'fast-html-parser'

export type COMMON_TYPE_COMP_ENV = ReturnType<typeof buildCommon>

/**
 * 仅在编译期生效的配置项
 */
export class CompilationEnv extends KeyValueDatabase<any, COMMON_TYPE_COMP_ENV> {

    constructor(crossEnv: CrossEnv, crossCode: CrossDepCode) {
        super()
        this.lazyInit(buildCommon(this, crossEnv, crossCode))
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

function buildCommon(_env: any, crossEnv: CrossEnv, crossCode: CrossDepCode) {
    const env = _env as CompilationEnv
    return {
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
        SERVICE_WORKER: buildEnv({
            default: 'sw',
            checker(value: string): false | RuntimeEnvErrorTemplate<any> {
                return value.endsWith('.js') ? {
                    value, message: 'SW 文件名不需要包含拓展名'
                } : false
            }
        }),
        /** HTML 数量限制，设置为 <= 0 表示不限制 */
        JSON_HTML_LIMIT: buildEnv({
            default: 0
        }),
        /** 版本信息长度限制 */
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
        /** swpp 的 JSON 文件的基本信息 */
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
                        const response = await fetcher.fetch(utils.splicingUrl(baseUrl, this.swppPath, this.versionPath))
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
        /** 读取一个本地文件 */
        readLocalFile: buildEnv({
            default: (path: string): Promise<string> => {
                return new Promise((resolve, reject) => {
                    fs.readFile(path, 'utf8', (err, data) => {
                        if (err) reject(err)
                        else resolve(data)
                    })
                })
            }
        }),
        /** 拉取网络文件 */
        NETWORK_FILE_FETCHER: buildEnv({
            default: new FiniteConcurrencyFetcher()
        }),
        /** 判断文件是否是 404 */
        isNotFound: buildEnv({
            default: {
                response: (response: Response) => response.status == 404,
                error: (err: any) => err?.cause?.code === 'ENOTFOUND'
            }
        }),
        /** 是否允许 404 */
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
        /** 文件解析器 */
        FILE_PARSER: buildEnv({
            default: createRegister(env, crossEnv, crossCode)
        }),
        /** 检查一个链接是否是稳定的（也就是 URL 不变其返回的结果永远不变） */
        isStable: buildEnv({
            default: (_url: URL): boolean => false
        })
    } as const
}

function createRegister(env: CompilationEnv, crossEnv: CrossEnv, crossCode: CrossDepCode) {
    const register = new FileParserRegistry({
        compilationEnv: env,
        crossEnv,
        crossDep: crossCode
    })
    register.registry('html', buildFileParser({
        readFromLocal(compilation: CompilationData, path: string): Promise<string> {
            return compilation.compilationEnv.read('readLocalFile')(path)
        },
        readFromNetwork(_: CompilationData, response: Response): Promise<string> {
            return response.text()
        },
        async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
            const baseUrl = compilation.compilationEnv.read("DOMAIN_HOST")
            const html = HTMLParser.parse(content, {
                script: true, style: true
            })
            const queue = [html]
            const result = new Set<string>()
            async function handleItem(item: HTMLParser.HTMLElement) {
                queue.push(...(item.childNodes ?? []))
                if (!item.tagName) return
                switch (item.tagName.toLowerCase()) {
                    case 'script': {
                        const src = item.attributes.src
                        if (src) {
                            if (!utils.isSameHost(src, baseUrl)) {
                                result.add(src)
                            }
                        } else {
                            const son = await register.parserContent('js', item.rawText)
                            son.forEach(it => result.add(it))
                        }
                        break
                    }
                    case 'link': {
                        if (item.attributes.rel !== 'preconnect') {
                            const href = item.attributes.href
                            if (!href) {
                                const son = await register.parserContent('css', item.rawText)
                                son.forEach(it => result.add(it))
                            } else if (!utils.isSameHost(href, baseUrl)) {
                                result.add(href)
                            }
                        }
                        break
                    }
                    case 'img': case 'source': case 'iframe': case 'embed': {
                        const src = item.attributes.src
                        if (src && !utils.isSameHost(src, baseUrl)) {
                            result.add(src)
                        }
                        break
                    }
                    case 'object': {
                        const data = item.attributes.data
                        if (data && !utils.isSameHost(data, baseUrl)) {
                            result.add(data)
                        }
                        break
                    }
                    case 'style': {
                        const son = await register.parserContent('css', item.rawText)
                        son.forEach(it => result.add(it))
                        break
                    }
                }
            }
            try {
                do {
                    const item = queue.pop() as HTMLElement
                    await handleItem(item)
                } while (queue.length > 0)
            } catch (e) {
                throw {
                    code: exceptionNames.error,
                    message: '解析 HTML 时出现错误',
                    cause: e
                } as RuntimeException
            }
            return result
        }
    }))
    register.registry('css', buildFileParser({
        readFromLocal(compilation: CompilationData, path: string): Promise<string> {
            return compilation.compilationEnv.read('readLocalFile')(path)
        },
        readFromNetwork(_: CompilationData, response: Response): Promise<string> {
            return response.text()
        },
        async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
            const baseUrl = compilation.compilationEnv.read('DOMAIN_HOST')
            const urls = new Set<string>()
            /** 从指定位置开始查询注释 */
            const findComment = (tag: string, start: number) => {
                for (let i = start; i < content.length;) {
                    const item = content[i]
                    switch (item) {
                        case tag[0]:
                            if (content[i + 1] === tag[1])
                                return i
                            ++i
                            break
                        case '"': case '\'':
                            while (true) {
                                const index = content.indexOf(item, i + 1)
                                if (index < 0) return -1
                                i = index + 1
                                if (content[index - 1] !== '\\')
                                    break
                            }
                            break
                        default:
                            ++i
                            break
                    }
                }
                return -1
            }
            for (let i = 0; i < content.length; ) {
                const left = findComment('/*', i)
                let sub
                if (left === -1) {
                    sub = content.substring(i)
                    i = Number.MAX_VALUE
                } else {
                    sub = content.substring(i, left)
                    const right = findComment('*/', left + 2)
                    if (right === -1) i = Number.MAX_VALUE
                    else i = right + 2
                }
                sub.match(/(url\(.*?\))|(@import\s+['"].*?['"])|((https?:)?\/\/[^\s/$.?#].\S*)/g)
                    ?.map(it => it.replace(/(^url\(\s*(['"]?))|((['"]?\s*)\)$)|(^@import\s+['"])|(['"]$)/g, ''))
                    ?.filter(it => !utils.isSameHost(it, baseUrl))
                    ?.forEach(it => urls.add(it))
            }
            return urls
        }
    }))
    return register
}