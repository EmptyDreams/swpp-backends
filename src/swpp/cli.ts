import {program} from 'commander'
import fs from 'fs'
import nodePath from 'path'
import {swppVersion} from '../index'
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
    /** dom js 的相对路径（相对于网站根目录，以 `/` 开头 `.js` 结尾） */
    domJsPath?: string
    /** 需要被排除的 html 文件名，正则表达式，区分大小写 */
    excludes?: string[]
    /** 是否生成 sw 文件 */
    serviceWorker?: boolean
    /** 是否向 HTML 中插入注册代码 */
    auto_register?: boolean
    /** 是否自动生成 DOM JS 并在 HTML 插入 <script> */
    gen_dom?: boolean
    /** diff json 的相对路径（相对于项目根目录）或绝对路径（以 .json 结尾） */
    diffJsonPath?: string

}

export async function initCommand() {
    program.version(swppVersion, '-v, --version', '查看当前 swpp backends 的版本号')
    program.addHelpText('after', '  每行显示一条指令信息，指令后跟方括号表示可选参数，尖括号表示必填参数')
    program.option('-b, --build [config: string]', '构建网站的 sw 与版本文件')
    program.option('--prod', '设置构建模式为生产模式（默认开发模式）')
    program.parse()
    if (program.opts().build) {
        const build = program.opts().build
        await runBuild(typeof build === 'string' ? build : undefined, program.opts().prod ? 'prod' : 'dev')
    } else if (program.opts().prod) {
        throw new RuntimeException(exceptionNames.unsupportedOperate, '--prod 选项必须搭配 --build 使用')
    }
}

/** 检查并初始化 CLI 配置 */
function checkAndInitConfig(cliConfig: SwppCliConfig) {
    if (!cliConfig.webRoot || !fs.existsSync(cliConfig.webRoot) || !fs.statSync(cliConfig.webRoot).isDirectory()) {
        throw new RuntimeException(exceptionNames.error, 'CLI 配置文件中缺少 webRoot 配置项或传入了一个非文件夹路径', { webRoot: cliConfig.webRoot })
    }
    if (cliConfig.domJsPath && (!cliConfig.domJsPath.startsWith('/') || !cliConfig.domJsPath.endsWith('.js'))) {
        throw new RuntimeException(exceptionNames.invalidValue, 'CLI 配置文件中的 domJsPath 应当传入一个 `/` 开头 `.js` 结尾的字符串')
    }
    if (!cliConfig.configFiles || cliConfig.configFiles.length === 0) {
        throw new RuntimeException(exceptionNames.nullPoint, 'CLI 配置文件中缺少 configFiles 配置项或数组长度为 0', { configFiles: cliConfig.configFiles })
    }
    if (cliConfig.diffJsonPath && !cliConfig.diffJsonPath.endsWith('.json')) {
        throw new RuntimeException(exceptionNames.invalidValue, 'CLI 配置文件中的 diffJsonPath 应当传入一个以 `.json` 结尾的字符串')
    }
    cliConfig.configFiles.forEach(path => {
        if (!fs.existsSync(path)) {
            throw new RuntimeException(exceptionNames.notFound, 'CLI 配置文件的 configFiles 配置项中某项目录不存在', { path })
        }
    })
    cliConfig.serviceWorker = cliConfig.serviceWorker ?? true
    cliConfig.auto_register = cliConfig.auto_register ?? true
    cliConfig.gen_dom = cliConfig.gen_dom ?? true
}

/** 执行 build 指令 */
async function runBuild(cliJsonPath: string = './swpp.cli.json', context: 'dev' | 'prod') {
    if (!cliJsonPath.endsWith('.json')) {
        throw new RuntimeException(exceptionNames.unsupportedFileType, 'CLI 配置文件仅支持 JSON 格式', { yourPath: cliJsonPath })
    }
    const cliConfig = JSON.parse(await utils.readFileUtf8(cliJsonPath)) as SwppCliConfig
    checkAndInitConfig(cliConfig)
    // 加载配置项
    const loader = new ConfigLoader(context)
    for (let item of cliConfig.configFiles) {
        const path = nodePath.isAbsolute(item) ? item : nodePath.resolve(item)
        await loader.load(path)
    }
    const {runtime, compilation} = loader.generate()
    // 计算文件目录
    const jsonInfo = compilation.compilationEnv.read('SWPP_JSON_FILE')
    const fileContent: Record<string, () => string> = {}
    fileContent[nodePath.join(cliConfig.webRoot, jsonInfo.swppPath, jsonInfo.trackerPath)] = () => newTracker.json()
    fileContent[nodePath.join(cliConfig.webRoot, jsonInfo.swppPath, jsonInfo.versionPath)] = () => JSON.stringify(updateJson)
    if (cliConfig.diffJsonPath) {
        fileContent[cliConfig.diffJsonPath] = () => updateJsonBuilder.serialize()
    }
    if (cliConfig.serviceWorker) {
        fileContent[
            nodePath.join(cliConfig.webRoot, compilation.compilationEnv.read('SERVICE_WORKER') + '.js')
            ] = () => new SwCompiler().buildSwCode(runtime)
    }
    if (cliConfig.gen_dom) {
        fileContent[nodePath.join(cliConfig.webRoot, cliConfig.domJsPath ?? '/sw-dom.js')] = () => runtime.domConfig.buildJsSource()
    }
    // 检查文件是否已经存在
    for (let path in fileContent) {
        if (fs.existsSync(path)) {
            throw new RuntimeException(exceptionNames.fileDuplicate, `指定文件[${path}]已存在`)
        }
    }
    // 扫描目录
    const scanner = new ResourcesScanner(compilation)
    const newTracker = await scanner.scanLocalFile(cliConfig.webRoot)
    const updateJsonBuilder = await newTracker.diff()
    const updateJson = await updateJsonBuilder.buildJson()
    fs.mkdirSync(nodePath.join(cliConfig.webRoot, jsonInfo.swppPath), {recursive: true})
    // 生成各项文件
    await Promise.all(
        Object.values(utils.objMap(fileContent, (value, key) => utils.writeFile(key, value())))
    )
    if (!cliConfig.auto_register && !cliConfig.gen_dom) return
    const regexes = cliConfig.excludes?.map?.(it => new RegExp(it)) ?? []
    const swRegistry = cliConfig.auto_register ? `<script>(${runtime.domConfig.read('registry')})()</script>` : ''
    const domJsScript = cliConfig.gen_dom ? `<script defer src="${cliConfig.domJsPath ?? '/sw-dom.js'}"></script>` : ''
    // 修改 html
    await traverseDirectory(cliConfig.webRoot, async file => {
        if (!file.endsWith('.html') || regexes.some(regex => regex.test(file))) return
        const html = await readHtml(compilation, file)
        const head = html.querySelector('head')!
        if (cliConfig.auto_register)
            head.insertAdjacentHTML('afterbegin', swRegistry)
        if (cliConfig.gen_dom)
            head.insertAdjacentHTML('beforeend', domJsScript)
        await utils.writeFile(file, html.outerHTML)
    })
}

async function readHtml(compilation: CompilationData, path: string): Promise<HTMLParser.HTMLElement> {
    const content = await compilation.compilationEnv.read('readLocalFile')(path)
    return HTMLParser.parse(content)
}