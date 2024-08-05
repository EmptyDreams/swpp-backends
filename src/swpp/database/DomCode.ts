import {CompilationData} from '../SwCompiler'
import {utils} from '../untils'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

export type COMMON_TYPE_DOM_CODE = ReturnType<typeof buildCommon>

export class DomCode extends RuntimeKeyValueDatabase<any, COMMON_TYPE_DOM_CODE> {

    constructor(compilation: CompilationData) {
        super(buildCommon(compilation))
    }

    buildJsSource(): string {
        return `
            document.addEventListener('DOMContentLoaded', () => {
                ${this.buildInnerSource()}
            }
        `
    }

    buildInnerSource(): string {
        const map = this.entries()
        delete map['registry']
        const inlineCode = Object.keys(map)
            .filter(it => it.startsWith('_inline'))
            .map(it => `${it}()`)
        return `
            const controller = navigator.serviceWorker?.controller
            if (!controller) return
            ${utils.anyToSource(map, false, 'const')};
            ${inlineCode.join(';\n')}
            navigator.serviceWorker.addEventListener('message', event => {
                messageEvent()
            })
        `
    }

}

let controller: ServiceWorker
let SESSION_KEY: string
let onSuccess: () => void
let pjaxUpdate: (url: string) => void
let postMessage2Sw: (type: string) => void

function buildCommon(compilation: CompilationData) {
    return {
        registry: {
            default: () => {
                const value = (() => {
                    const sw = navigator.serviceWorker
                    if (sw) {
                        sw.register('$$sw.js')
                            .then(() => console.log('SWPP 注册成功'))
                            .catch(err => console.error('SWPP 注册失败', err))
                    } else {
                        console.warn('当前浏览器不支持 SW')
                    }
                }).toString()
                const path = compilation.compilationEnv.read('SERVICE_WORKER')
                return value.replace(`'$$sw.js'`, path + '.js')
            }
        },
        postMessage2Sw: {
            default: (type: string) => controller.postMessage(type)
        },
        pjaxUpdate: {
            default: (url: string) => {
                const type = url.endsWith('js') ? 'script' : 'link'
                const name = type === 'link' ? 'href' : 'src'
                for (let item of document.getElementsByTagName(type)) {
                    // @ts-ignore
                    const itUrl = item[name]
                    if (url.length > itUrl ? url.endsWith(itUrl) : itUrl.endsWith(url)) {
                        const newEle = document.createElement(type)
                        const content = item.textContent || item.innerHTML || ''
                        Array.from(item.attributes).forEach(attr => newEle.setAttribute(attr.name, attr.value))
                        newEle.appendChild(document.createTextNode(content))
                        item.parentNode!.replaceChildren(newEle, item)
                        return
                    }
                }
            }
        },
        SESSION_KEY: {
            default: 'updated'
        },
        onSuccess: {
            default: () => console.log('版本更新成功')
        },
        _inlineA: {
            default: () => {
                if (sessionStorage.getItem(SESSION_KEY)) {
                    onSuccess()
                    sessionStorage.removeItem(SESSION_KEY)
                } else postMessage2Sw('update')
            }
        },
        messageEvent: {
            default: async (event: MessageEvent) => {
                const data = event.data
                sessionStorage.setItem(SESSION_KEY, data.type)
                const list = data.data?.filter((url: string) => /\.(js|css)$/.test(url))
                if (list?.length) {
                    // @ts-ignore
                    if (window.Pjax?.isSupported?.())
                        list.forEach(pjaxUpdate)
                    location.reload()
                } else {
                    onSuccess()
                    sessionStorage.removeItem(SESSION_KEY)
                }
            }
        }
    } as const
}