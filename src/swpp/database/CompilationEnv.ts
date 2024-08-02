import {HTMLElement} from 'fast-html-parser'
import fs from 'fs'
import {buildFileParser, FileParserRegistry} from '../FileParser'
import {UpdateJson} from '../JsonBuilder'
import {FiniteConcurrencyFetcher} from '../NetworkFileHandler'
import {CompilationData} from '../SwCompiler'
import {utils} from '../untils'
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
            default: 'www.example.com',
            checker(value: string): false | RuntimeEnvErrorTemplate<any> {
                if (value === 'www.example.com') return {
                    value, message: '应当手动设置一个域名而非使用默认域名'
                }
                if (value.includes('/')) return {
                    value, message: '传入的域名不应当包含“/”字符'
                }
                if (value.includes('#') || value.includes('?')) return {
                    value, message: '传入的域名不应当包含查询参数和片段标识符'
                }
                if (!value.includes('.') || !/^[a-zA-Z0-9.-]$/.test(value)) return {
                    value, message: '传入的域名不是一个合法的域名'
                }
                return false
            }
        }),
        /** HTML 数量限制 */
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
        /** 获取已经上线的版本文件 */
        VERSION_FILE: buildEnv({
            default: async (): Promise<UpdateJson> => {
                const host = env.read('DOMAIN_HOST')
                const fetcher = env.read('FETCH_NETWORK_FILE')
                const isNotFound = env.read('IS_NOT_FOUND')
                try {
                    const response = await fetcher.fetch(`https://${host}/update.json`)
                    if (!isNotFound.response(response)) {
                        const json = await response.json()
                        return json as UpdateJson
                    }
                } catch (e) {
                    if (!isNotFound.error(e)) throw e
                }
                return {global: 0, info: []}
            }
        }),
        /** 读取一个本地文件 */
        LOCAL_FILE_READER: buildEnv({
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
        FETCH_NETWORK_FILE: buildEnv({
            default: new FiniteConcurrencyFetcher()
        }),
        /** 判断文件是否是 404 */
        IS_NOT_FOUND: buildEnv({
            default: {
                response: (response: Response) => response.status == 404,
                error: (err: any) => err?.cause?.code === 'ENOTFOUND'
            }
        }),
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
        FILE_PARSER: buildEnv({
            default: createRegister(env, crossEnv, crossCode)
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
            return compilation.compilationEnv.read('LOCAL_FILE_READER')(path)
        },
        readFromNetwork(_: CompilationData, response: Response): Promise<string> {
            return response.text()
        },
        async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
            const host = compilation.compilationEnv.read("DOMAIN_HOST")
            const html = HTMLParser.parse(content, {
                script: true, style: true
            })
            const queue = [html]
            const result = new Set<string>()
            async function handleItem(item: HTMLParser.HTMLElement) {
                queue.push(...item.childNodes)
                switch (item.tagName.toLowerCase()) {
                    case 'script': {
                        if (!register.containsType('script')) break
                        const src = item.attributes.src
                        if (src) {
                            const son = await register.parserContent('script', item.rawText)
                            son.forEach(it => result.add(it))
                        } else if (!utils.isSameHost(src, host)) {
                            result.add(src)
                        }
                        break
                    }
                    case 'link': {
                        if (item.attributes.rel !== 'preconnect') {
                            const href = item.attributes.href
                            if (!utils.isSameHost(href, host))
                                result.add(href)
                        }
                        break
                    }
                    case 'img': case 'source': case 'iframe': case 'embed': {
                        const src = item.attributes.src
                        if (src && !utils.isSameHost(src, host)) {
                            result.add(src)
                        }
                        break
                    }
                    case 'object': {
                        const data = item.attributes.data
                        if (data && !utils.isSameHost(data, host)) {
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
            do {
                const item = queue.pop() as HTMLElement
                try {
                    await handleItem(item)
                } catch (e) {
                    utils.printError('PARSER HTML', e)
                }
            } while (queue.length > 0)
            return result
        }
    }))
    register.registry('css', buildFileParser({
        readFromLocal(compilation: CompilationData, path: string): Promise<string> {
            return compilation.compilationEnv.read('LOCAL_FILE_READER')(path)
        },
        readFromNetwork(_: CompilationData, response: Response): Promise<string> {
            return response.text()
        },
        async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
            const host = compilation.compilationEnv.read('DOMAIN_HOST')
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
                    ?.filter(it => !utils.isSameHost(it, host))
                    ?.forEach(it => urls.add(it))
            }
            return urls
        }
    }))
    return register
}