import {FunctionInBrowser} from './RuntimeDepCode'
import {RuntimeKeyValueDatabase} from './RuntimeKeyValueDatabase'

let handleFetchEvent: (event: Event) => void

export type COMMON_TYPE_RUNTIME_EVENT = ReturnType<typeof buildCommon>

export class RuntimeEventCode extends RuntimeKeyValueDatabase<FunctionInBrowser<[Event], any>, COMMON_TYPE_RUNTIME_EVENT> {

    constructor() {
        super(buildCommon())
    }

    /** 构建 JS 源代码 */
    buildJsSource(): string {
        const result: string[] = []
        const entries = this.entries()
        for (let eventName in entries) {
            result.push(`self.addEventListener('${eventName}', ${entries[eventName].toString()})`)
        }
        return result.join(';\n')
    }

}

function buildCommon() {
    return {
        /** sw 激活后立即对所有页面生效，而非等待刷新 */
        activate: {
            // @ts-ignore
            default: (event: Event) => event.waitUntil(clients.claim())
        },
        fetch: {
            default: (event: Event) => handleFetchEvent(event)
        },
        /** 后台检查更新 */
        periodicSync: {
            default: (event: Event) => {
                // @ts-ignore
                if (event.tag === 'update') {
                    // @ts-ignore
                    event.waitUntil(handleUpdate(true))
                }
            }
        },
        message: {
            default: (event: Event) => {
                // @ts-ignore
                const data = event.data
                switch (data.type) {
                    case 'update':
                        // @ts-ignore
                        handleUpdate()
                        break
                }
            }
        }
    } as const
}