document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.serviceWorker?.controller) return
    /** 发送信息到 sw */
    const postMessage2SW = type => navigator.serviceWorker.controller.postMessage(type)
    const pjaxUpdate = url => {
        const type = url.endsWith('js') ? 'script' : 'link'
        const name = type === 'link' ? 'href' : 'src'
        for (let item of document.getElementsByTagName(type)) {
            const itUrl = item[name]
            if (url.length > itUrl ? url.endsWith(itUrl) : itUrl.endsWith(url)) {
                const newEle = document.createElement(type)
                const content = item.text || item.textContent || item.innerHTML || ''
                // noinspection JSUnresolvedReference
                Array.from(item.attributes).forEach(attr => newEle.setAttribute(attr.name, attr.value))
                newEle.appendChild(document.createTextNode(content))
                item.parentNode.replaceChildren(newEle, item)
                return true
            }
        }
    }
    const prevUpdated = sessionStorage.getItem('updated')
    if (prevUpdated) {
        sessionStorage.removeItem('updated');
        // ${onSuccess}
    } else if (prevUpdated !== '2') postMessage2SW('update')
    navigator.serviceWorker.addEventListener('message', event => {
        const data = event.data
        switch (data.type) {
            case 'update':
                const list = data.list
                sessionStorage.setItem('updated', '1')
                // noinspection JSUnresolvedVariable,JSUnresolvedFunction
                if (list && window.Pjax?.isSupported()) {
                    list.filter(url => /\.(js|css)$/.test(url))
                        .forEach(pjaxUpdate)
                }
                location.reload()
                break
            case 'escape':
                sessionStorage.setItem('updated', '2')
                location.reload()
                break
        }
    })
})