import {HTMLElement} from 'fast-html-parser'
import fs from 'fs'
import {buildFileParser, FileParserRegistry} from '../FileParser'
import {FiniteConcurrencyFetcher} from '../NetworkFileHandler'
import {CompilationData} from '../SwCompiler'
import {utils} from '../untils'
import {CrossDepCode} from './CrossDepCode'
import {buildEnv, KeyValueDatabase, RuntimeEnvErrorTemplate} from './KeyValueDatabase'
import * as HTMLParser from 'fast-html-parser'

/**
 * 仅在编译期生效的配置项
 */
export class CompilationEnv extends KeyValueDatabase<any> {

    constructor(env: CompilationEnv, cross: CrossDepCode) {
        super({
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
            })
        })
        /** 解析文件内容 */
        const register = new FileParserRegistry({env, crossDep: cross})
        register.registry('html', buildFileParser({
            readFromLocal(compilation: CompilationData, path: string): Promise<string> {
                return compilation.env.read('LOCAL_FILE_READER')(path)
            },
            readFromNetwork(_: CompilationData, response: Response): Promise<string> {
                return response.text()
            },
            async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
                const host = compilation.env.read("DOMAIN_HOST") as string
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
                return compilation.env.read('LOCAL_FILE_READER')(path)
            },
            readFromNetwork(_: CompilationData, response: Response): Promise<string> {
                return response.text()
            },
            async extractUrls(compilation: CompilationData, content: string): Promise<Set<string>> {
                const host = compilation.env.read('DOMAIN_HOST') as string
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
        this.append('FILE_PARSER', buildEnv({default: register}))
    }

}