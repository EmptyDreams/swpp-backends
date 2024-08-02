import {utils} from './swpp/untils'

/** 版本号 */
export const version = require('../package.json').version

export { utils, RuntimeException } from './swpp/untils'
export { ResourcesScanner, FileUpdateTracker,  } from './swpp/ResourcesScanner'
export { JsonBuilder, UpdateJson, UpdateChangeExp, TrackerHeaderDiff } from './swpp/JsonBuilder'
export { FileParserRegistry, FileParser, FileMark } from './swpp/FileParser'
export { SwCompiler, CompilationData, RuntimeData, BrowserVersion } from './swpp/SwCompiler'
export { NetworkFileHandler, FiniteConcurrencyFetcher } from './swpp/NetworkFileHandler'

export {
    ConfigLoader, SwppConfigRuntimeEvent,
    SwppConfigRuntimeCore, SwppConfigRuntimeDep, SwppConfigCrossDep,
    SwppConfigCrossEnv, SwppConfigCompilationEnv, SwppConfigTemplate, SwppConfigDomConfig,
    defineCompilationEnv, defineConfig, defineCrossEnv, defineCrossDep,
    defineRuntimeDep, defineRuntimeCore, defineRuntimeEvent, defineDomConfig,
    defineIndivisibleConfig
} from './swpp/config/ConfigLoader'

export {
    KeyValueDatabase, DatabaseValue, RuntimeEnvErrorTemplate, RuntimeEnvException
} from './swpp/database/KeyValueDatabase'
export { RuntimeKeyValueDatabase } from './swpp/database/RuntimeKeyValueDatabase'
export { RuntimeEventCode } from './swpp/database/RuntimeEventCode'
export { RuntimeCoreCode } from './swpp/database/RuntimeCoreCode'
export { RuntimeDepCode } from './swpp/database/RuntimeDepCode'
export { CrossEnv } from './swpp/database/CrossEnv'
export { CrossDepCode } from './swpp/database/CrossDepCode'
export { CompilationEnv, AllowNotFoundEnum } from './swpp/database/CompilationEnv'
export { DomCode } from './swpp/database/DomCode'

utils.printInfo('INDEX', `欢迎使用 swpp@${version}`)