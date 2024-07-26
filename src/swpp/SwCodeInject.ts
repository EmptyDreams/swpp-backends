import {exceptionNames, RuntimeException, utils} from './untils'

export class SwCodeInject {

    private list: Array<[key: InjectKey, pos: 'before' | 'after', code: string]> = []

    /** 在指定位置前插入代码 */
    injectBefore(key: InjectKey, code: () => void) {
        const varName = `$${key}${this.list.length}`
        const obj: any = {}
        obj[varName] = code
        const codeText = utils.anyToSource(obj, false, 'const')
        this.list.push([key, 'before', codeText + '\n' + varName + '();'])
    }

    /** 在指定位置之后插入代码 */
    injectAfter(key: InjectKey, code: () => void) {
        const varName = `$${key}${this.list.length}`
        const obj: any = {}
        obj[varName] = code
        const codeText = utils.anyToSource(obj, false, 'const')
        this.list.push([key, 'after', codeText + '\n' + varName + '();'])
    }

    /**
     * 处理代码
     * @throws RuntimeException 若存在非法的 inject key / {code: 'invalid_inject_key'}
     * @throws RuntimeException 若存在重复的 inject key / {code: 'repeat_inject_key'}
     */
    handleCode(swCode: string): string {
        /** 处理代码插入 */
        function splitCodeByInject(swCode: string): Array<[key: InjectKey, code: string]> {
            const regex = /\$\$inject_mark_range_start\(['"]([^'"]+)['"]\)([^$]*)/g
            const result: [key: InjectKey, code: string][] = []
            let match = null
            while (match = regex.exec(swCode)) {
                const key = match[1]
                if (!isInjectKey(key)) {
                    throw {
                        code: exceptionNames.invalidInjectKey,
                        message: `输入的插入键[${match[1]}]不存在`
                    } as RuntimeException
                }
                if (result.find(it => it[0] == key)) {
                    throw {
                        code: exceptionNames.repeatInjectKey,
                        message: `存在两个或两个以上相同的插入键[${key}]`
                    }
                }
                result.push([key, match[2].trim()])
            }
            return result
        }
        const ranges = splitCodeByInject(swCode)
        this.forEach((key, pos, code) => {
            const injected = ranges.find(it => it[0] == key)!!
            switch (pos) {
                case "before":
                    injected[1] = code + injected[1]
                    break
                case "after":
                    injected[1] += code
                    break
            }
        })
        return ranges.map(it => it[1]).join(';\n')
    }

    /** 遍历所有元素 */
    forEach(consumer: (key: InjectKey, pos: 'before' | 'after', code: string) => void) {
        this.list.forEach(it => consumer(it[0], it[1], it[2]))
    }

}

export type InjectKey = 'var' | 'no_deps_fun' | 'core' | 'event'

export function isInjectKey(value: string): value is InjectKey {
    return ['var', 'no_deps_fun', 'core', 'event'].includes(value)
}