import {ServiceWorkerConfig} from './SwppConfig'
import {readRules} from './SwppRules'
import {getSource, readEjectData} from './Utils'
import fs from 'fs'
import nodePath from 'path'

/**
 * 构建 sw
 *
 * + **执行该函数前必须调用过 [loadRules]**
 * + **执行该函数前必须调用过 [calcEjectValues]**
 */
export function buildServiceWorker(): string {
    const rules = readRules()
    const eject = readEjectData()
    const {
        modifyRequest,
        fetchFile,
        getRaceUrls,
        getSpareUrls,
        blockRequest,
        config
    } = rules
    const serviceWorkerConfig = config.serviceWorker as ServiceWorkerConfig
    const templatePath = nodePath.resolve('./', module.path, 'sw-template.js')
    // 获取拓展文件
    let cache = getSource(rules, undefined, [
        'cacheList', 'modifyRequest', 'getCdnList', 'getSpareUrls', 'blockRequest', 'fetchFile',
        ...('external' in rules && Array.isArray(rules.external) ? rules.external : [])
    ], true) + '\n'
    if (!fetchFile) {
        if (getRaceUrls)
            cache += JS_CODE_GET_CDN_LIST
        else if (getSpareUrls)
            cache += JS_CODE_GET_SPARE_URLS
        else
            cache += JS_CODE_DEF_FETCH_FILE
    }
    if (!getSpareUrls) cache += `\nconst getSpareUrls = _ => {}`
    if ('afterJoin' in rules)
        cache += `(${getSource(rules['afterJoin'])})()\n`
    if ('afterTheme' in rules)
        cache += `(${getSource(rules['afterTheme'])})()\n`
    const keyword = "const { cacheList, fetchFile, getSpareUrls } = require('../sw-rules')"
    // noinspection JSUnresolvedVariable
    let content = fs.readFileSync(templatePath, 'utf8')
        .replaceAll("// [insertion site] values", eject.strValue ?? '')
        .replaceAll(keyword, cache)
        .replaceAll("'@$$[escape]'", (serviceWorkerConfig.escape).toString())
        .replaceAll("'@$$[cacheName]'", `'${serviceWorkerConfig.cacheName}'`)
    if (modifyRequest) {
        content = content.replaceAll('// [modifyRequest call]', `
                const modify = modifyRequest(request)
                if (modify) request = modify
            `).replaceAll('// [modifyRequest else-if]', `
                else if (modify) event.respondWith(fetch(request))
            `)
    }
    if (blockRequest) {
        content = content.replace('// [blockRequest call]', `
                if (blockRequest(url))
                    return event.respondWith(new Response(null, {status: 208}))
            `)
    }
    // noinspection JSUnresolvedVariable
    if (serviceWorkerConfig.debug) {
        content = content.replaceAll('// [debug delete]', `
                console.debug(\`delete cache: \${url}\`)
            `).replaceAll('// [debug put]', `
                console.debug(\`put cache: \${key}\`)
            `).replaceAll('// [debug message]', `
                console.debug(\`receive: \${event.data}\`)
            `).replaceAll('// [debug escape]', `
                console.debug(\`escape: \${aid}\`)
            `)
    }
    return content
}

// 缺省的 fetchFile 函数的代码
const JS_CODE_DEF_FETCH_FILE = `
    const fetchFile = (request, banCache) => fetch(request, {
        cache: banCache ? "no-store" : "default",
        mode: 'cors',
        credentials: 'same-origin'
    })
`

// getCdnList 函数的代码
const JS_CODE_GET_CDN_LIST = `
    const fetchFile = (request, banCache) => {
        const fetchArgs = {
            cache: banCache ? 'no-store' : 'default',
            mode: 'cors',
            credentials: 'same-origin'
        }
        const list = getCdnList(request.url)
        if (!list || !Promise.any) return fetch(request, fetchArgs)
        const res = list.map(url => new Request(url, request))
        const controllers = []
        return Promise.any(res.map(
            (it, index) => fetch(it, Object.assign(
                {signal: (controllers[index] = new AbortController()).signal},
                fetchArgs
            )).then(response => checkResponse(response) ? {index, response} : Promise.reject())
        )).then(it => {
            for (let i in controllers) {
                if (i != it.index) controllers[i].abort()
            }
            return it.response
        })
    }
`

// getSpareUrls 函数的代码
const JS_CODE_GET_SPARE_URLS = `
    const fetchFile = (request, banCache, spare = null) => {
        const fetchArgs = {
            cache: banCache ? 'no-store' : 'default',
            mode: 'cors',
            credentials: 'same-origin'
        }
        if (!spare) spare = getSpareUrls(request.url)
        if (!spare) return fetch(request, fetchArgs)
        const list = spare.list
        const controllers = []
        let error = 0
        return new Promise((resolve, reject) => {
            const pull = () => {
                const flag = controllers.length
                if (flag === list.length) return
                const plusError = () => {
                    if (++error === list.length) reject(\`请求 \${request.url} 失败\`)
                    else if (flag + 1 === controllers.length) {
                        clearTimeout(controllers[flag].id)
                        pull()
                    }
                }
                controllers.push({
                    ctrl: new AbortController(),
                    id: setTimeout(pull, spare.timeout)
                })
                fetch(new Request(list[flag], request), fetchArgs).then(response => {
                    if (checkResponse(response)) {
                        for (let i in controllers) {
                            if (i !== flag) controllers[i].ctrl.abort()
                            clearTimeout(controllers[i].id)
                        }
                        resolve(response)
                    } else plusError()
                }).catch(plusError)
            }
            pull()
        })
    }
`