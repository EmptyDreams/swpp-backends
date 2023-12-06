/** @type function */
let getRaceUrls, checkResponse, getSpareUrls, fetchWithCors

module.exports.JS_CODE_DEF_FETCH_FILE = 'const fetchFile = fetchWithCors;'

module.exports.JS_CODE_GET_CDN_LIST= 'const fetchFile = ' + (
    (request, banCache, urls) => {
        if (!urls) {
            urls = getRaceUrls(request.url)
            if (!urls) return fetchWithCors(request, banCache)
        }
        if (!urls || !Promise.any) return fetchWithCors(request, banCache)
        const res = urls.map(url => new Request(url, request))
        const controllers = []
        // noinspection JSCheckFunctionSignatures
        return Promise.any(
            res.map((it, index) => fetchWithCors(
                it, banCache,
                {signal: (controllers[index] = new AbortController()).signal}
            ).then(response => checkResponse(response) ? {index, response} : Promise.reject()))
        ).then(it => {
            for (let i in controllers) {
                if (i !== it.index) controllers[i].abort()
            }
            return it.response
        })
    }
).toString()

module.exports.JS_CODE_GET_SPARE_URLS = 'const fetchFile = ' + (
    (request, banCache, urls = null) => {
        if (!urls) {
            urls = getSpareUrls(request.url)
            if (!urls) return fetchWithCors(request, banCache)
        }
        const list = urls.list
        const controllers = new Array(list.length)
        // noinspection JSCheckFunctionSignatures
        const startFetch = index => fetchWithCors(
                new Request(list[index], request),
                banCache,
                {signal: (controllers[index] = new AbortController()).signal}
            ).then(response => checkResponse(response) ? {r: response, i: index} : Promise.reject())
        return new Promise((resolve, reject) => {
            let flag = true
            const startAll = () => {
                flag = false
                Promise.any([
                    first,
                    ...Array.from({
                        length: list.length - 1
                    }, (_, index) => index + 1).map(index => startFetch(index))
                ]).then(res => {
                    for (let i = 0; i !== list.length; ++i) {
                        if (i !== res.i)
                            controllers[i].abort()
                    }
                    resolve(res.r)
                }).catch(() => reject(`请求 ${request.url} 失败`))
            }
            const id = setTimeout(startAll, urls.timeout)
            const first = startFetch(0)
                .then(res => {
                    if (flag) {
                        clearTimeout(id)
                        resolve(res.r)
                    }
                }).catch(() => {
                    if (flag) {
                        clearTimeout(id)
                        startAll()
                    }
                    return Promise.reject()
                })
        })
    }
).toString()