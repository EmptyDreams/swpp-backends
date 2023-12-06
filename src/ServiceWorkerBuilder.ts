import {ServiceWorkerConfig} from './SwppConfig'
import {error, getSource, readEjectData} from './Utils'
import fs from 'fs'
import nodePath from 'path'
import {readRules} from './Variant'

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
        skipRequest,
        fetchFile,
        getRaceUrls,
        getSpareUrls,
        blockRequest,
        config
    } = rules
    if (!config.serviceWorker) {
        error('ServiceWorkerBuilder', '插件未开启该项')
        throw '功能未开启'
    }
    const serviceWorkerConfig = config.serviceWorker as ServiceWorkerConfig
    const templatePath = nodePath.resolve('./', module.path, 'resources/sw-template.js')
    // 获取拓展文件
    let cache = getSource(rules, undefined, [
        'cacheRules', 'modifyRequest', 'getRaceUrls', 'getSpareUrls', 'blockRequest', 'fetchFile', 'skipRequest', 'isCors', 'isMemoryQueue',
        ...('external' in rules && Array.isArray(rules.external) ? rules.external : [])
    ], true) + '\n'
    let fetchFileReplaced
    if (!fetchFile) {
        const {
            JS_CODE_GET_CDN_LIST,
            JS_CODE_GET_SPARE_URLS,
            JS_CODE_DEF_FETCH_FILE
        } = require('./resources/sw-fetch.js')
        let selected, replaced
        if (getRaceUrls) {
            selected = JS_CODE_GET_CDN_LIST
            fetchFileReplaced = 'getRaceUrls(request.url)'
        } else if (getSpareUrls) {
            selected = JS_CODE_GET_SPARE_URLS
            fetchFileReplaced = 'getSpareUrls(request.url)'
        } else {
            selected = JS_CODE_DEF_FETCH_FILE
            fetchFileReplaced = 'null'
        }
        cache += selected
    }
    if (!getSpareUrls) cache += `\nconst getSpareUrls = _ => {}`
    if ('afterJoin' in rules)
        cache += `(${getSource(rules['afterJoin'])})()\n`
    if ('afterTheme' in rules)
        cache += `(${getSource(rules['afterTheme'])})()\n`
    const keyword = "const { cacheRules, fetchFile, isCors, isMemoryQueue } = require('../sw-rules')"
    // noinspection JSUnresolvedVariable
    let content = fs.readFileSync(templatePath, 'utf8')
        .replaceAll("// [insertion site] values", eject?.strValue ?? '')
        .replaceAll(keyword, cache)
        .replaceAll("'@$$[escape]'", (serviceWorkerConfig.escape).toString())
        .replaceAll("'@$$[cacheName]'", `'${serviceWorkerConfig.cacheName}'`)
    if (fetchFileReplaced) {
        content = content.replaceAll('[] // [spareUrls or raceUrls call]', fetchFileReplaced)
    }
    if (modifyRequest) {
        content = content.replaceAll('// [modifyRequest call]', `
                const modify = modifyRequest(request)
                if (modify) {
                    request = modify
                    url = new URL(request.url)
                }
            `).replaceAll('// [modifyRequest else-if]', `
                else if (modify) handleFetch(fetchWithCache(request, false).catch(err => new Response(err, {status: 499})))
            `)
    }
    if (skipRequest) {
        content = content.replaceAll('// [skipRequest call]', `if (skipRequest(request)) return;`)
    }
    if (blockRequest) {
        content = content.replace('// [blockRequest call]', `
                if (blockRequest(url))
                    return event.respondWith(new Response(null, {status: 204}))
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