// noinspection JSUnusedGlobalSymbols

import {initCommand} from './swpp/cli'
import {utils} from './swpp/untils'

/** 版本号 */
export const swppVersion = require('../package.json').version as string

export {utils, RuntimeException} from './swpp/untils'
export {ResourcesScanner, FileUpdateTracker,} from './swpp/ResourcesScanner'
export {JsonBuilder, UpdateJson, UpdateChangeExp, TrackerHeaderDiff} from './swpp/JsonBuilder'
export {SwCompiler, CompilationData, RuntimeData, BrowserVersion} from './swpp/SwCompiler'
export {NetworkFileHandler, FiniteConcurrencyFetcher} from './swpp/NetworkFileHandler'

export {KeyValueDatabase, readThisValue} from './swpp/database/KeyValueDatabase'
export {RuntimeKeyValueDatabase} from './swpp/database/RuntimeKeyValueDatabase'
export {RuntimeEventCode} from './swpp/database/RuntimeEventCode'
export {RuntimeCoreCode} from './swpp/database/RuntimeCoreCode'
export {RuntimeDepCode} from './swpp/database/RuntimeDepCode'
export {CrossEnv} from './swpp/database/CrossEnv'
export {CrossDepCode} from './swpp/database/CrossDepCode'
export {CompilationEnv, AllowNotFoundEnum} from './swpp/database/CompilationEnv'
export {FileMark, FileParser} from './swpp/database/CompilationFileParser'
export {DomCode} from './swpp/database/DomCode'

export {
    ConfigLoader,
    defineConfig,
    defineRuntimeEvent, defineDomConfig, defineRuntimeCore, defineCrossDep,
    defineRuntimeDep, defineCrossEnv, defineCompilationEnv, defineCompilationFP,
    defineModifier
} from './swpp/config/ConfigLoader'
export {SpecialConfig, IndivisibleConfig, NoCacheConfig} from './swpp/config/SpecialConfig'
export {
    defineIndivisibleConfig, defineContextConfig,
    defineNoCacheConfig, defineLazyInitConfig
} from './swpp/config/ConfigCluster'

initCommand().catch(e => {
    utils.printError('COMMAND', '执行指令时出现异常')
    throw e
})