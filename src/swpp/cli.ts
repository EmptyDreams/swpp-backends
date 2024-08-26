import {program} from 'commander'
import fs from 'fs'
import nodePath from 'path'
import {ConfigLoader} from './config/ConfigLoader'
import {ResourcesScanner, traverseDirectory} from './ResourcesScanner'
import {CompilationData, SwCompiler} from './SwCompiler'
import {exceptionNames, RuntimeException, utils} from './untils'
import * as HTMLParser from 'node-html-parser'

export interface SwppCliConfig {

    /** 网站根目录 */
    webRoot: string
    /** 配置文件所在的相对路径（越靠前优先级越高） */
    configFiles: string[]
    /** dom js 的相对路径（以 `/` 开头 `.js` 结尾） */
    domJsPath?: string
    /** 需要被排除的 html 文件名，正则表达式，区分大小写 */
    excludes?: string[]

}

export async function initCommand() {
    // 加载指令及 json 配置文件
    const cliJsonPathDefault = './swpp.cli.json'
    program.option('-b, --build <config>', '构建网站的 sw 与版本文件', cliJsonPathDefault)
    program.parse(["", __filename])
    const cliJsonPath = program.opts().build as string ?? cliJsonPathDefault
    if (!cliJsonPath.endsWith('.json')) {
        throw new RuntimeException(exceptionNames.unsupportedFileType, 'CLI 配置文件仅支持 JSON 格式', { yourPath: cliJsonPath })
    }
    const cliConfig = JSON.parse(await utils.readFileUtf8(cliJsonPath)) as SwppCliConfig
    if (!cliConfig.webRoot || !fs.existsSync(cliConfig.webRoot) || !fs.statSync(cliConfig.webRoot).isDirectory()) {
        throw new RuntimeException(exceptionNames.error, 'CLI 配置文件中缺少 webRoot 配置项或传入了一个非文件夹路径', { webRoot: cliConfig.webRoot })
    }
    if (cliConfig.domJsPath && (!cliConfig.domJsPath.startsWith('/') || !cliConfig.domJsPath.endsWith('.js'))) {
        throw new RuntimeException(exceptionNames.invalidVarName, 'CLI 配置文件中的 domJsPath 应当传入一个 `/` 开头 `.js` 结尾的字符串')
    }
    if (!cliConfig.configFiles || cliConfig.configFiles.length === 0) {
        throw new RuntimeException(exceptionNames.nullPoint, 'CLI 配置文件中缺少 configFiles 配置项或数组长度为 0', { configFiles: cliConfig.configFiles })
    }
    cliConfig.configFiles.forEach(path => {
        if (!fs.existsSync(path)) {
            throw new RuntimeException(exceptionNames.notFound, 'CLI 配置文件的 configFiles 配置项中某项目录不存在', { path })
        }
    })
    // 加载配置项
    const loader = new ConfigLoader()
    for (let item of cliConfig.configFiles) {
        const path = nodePath.isAbsolute(item) ? item : nodePath.resolve(item)
        await loader.load(path)
    }
    const {runtime, compilation} = loader.generate()
    // 扫描目录
    const jsonInfo = compilation.compilationEnv.read('SWPP_JSON_FILE')
    const scanner = new ResourcesScanner(compilation)
    const newTracker = await scanner.scanLocalFile(cliConfig.webRoot)
    const updateJsonBuilder = await newTracker.diff()
    const updateJson = await updateJsonBuilder.buildJson()
    fs.mkdirSync(nodePath.join(cliConfig.webRoot, jsonInfo.swppPath), {recursive: true})
    // 生成各项文件
    await Promise.all([
        // 生成 json
        utils.writeFile(nodePath.join(cliConfig.webRoot, jsonInfo.swppPath, jsonInfo.trackerPath), newTracker.json()),
        utils.writeFile(nodePath.join(cliConfig.webRoot, jsonInfo.swppPath, jsonInfo.versionPath), JSON.stringify(updateJson)),
        // 生成 sw js
        utils.writeFile(nodePath.join(cliConfig.webRoot, compilation.compilationEnv.read('SERVICE_WORKER') + '.js'), new SwCompiler().buildSwCode(runtime)),
        // 生成 dom js
        utils.writeFile(nodePath.join(cliConfig.webRoot, cliConfig.domJsPath ?? '/sw-dom.js'), runtime.domConfig.buildJsSource())
    ])
    const regexes = cliConfig.excludes?.map?.(it => new RegExp(it)) ?? []
    const swRegistry = `<script>(${runtime.domConfig.read('registry')})()</script>`
    const domJsScript = `<script defer src="${cliConfig.domJsPath ?? '/sw-dom.js'}"></script>`
    // 修改 html
    await traverseDirectory(cliConfig.webRoot, async file => {
        if (!file.endsWith('.html') || regexes.some(regex => regex.test(file))) return
        const html = await readHtml(compilation, file)
        const head = html.querySelector('head')!
        head.insertAdjacentHTML('afterbegin', swRegistry)
        head.insertAdjacentHTML('beforeend', domJsScript)
        await utils.writeFile(file, html.outerHTML)
    })
}

async function readHtml(compilation: CompilationData, path: string): Promise<HTMLParser.HTMLElement> {
    const content = await compilation.compilationEnv.read('readLocalFile')(path)
    return HTMLParser.parse(content)
}