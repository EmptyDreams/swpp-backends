import {exceptionNames, RuntimeException} from '../untils'

export class CallChainRecorder {

    private readonly chain: {namespace: string, key: string}[] = []

    push(namespace: string, key: string) {
        const size = this.chain.push({namespace, key})
        const index1 = this.chain.findIndex(it => it.namespace === namespace && it.key === key)
        if (index1 + 1 !== size) {
            throw new RuntimeException(exceptionNames.circularDependencies, '环境变量产生了循环依赖', {
                chain: this.chain.map((it, index) => {
                    return `${it.namespace}::${it.key}${index % 5 == 4 ? '\n' : ''}`
                }).join(' -> ')
            })
        }
    }

    pop(namespace: string, key: string) {
        const popValue = this.chain.pop()
        if (!popValue || popValue.namespace !== namespace || popValue.key !== key) {
            throw new RuntimeException(exceptionNames.error, '调用链追踪错误', {
                chain: this.chain, popValue, expected: {namespace, key}
            })
        }
    }

}