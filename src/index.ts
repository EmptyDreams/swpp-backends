import {COMMON_TYPE_COMP_ENV} from './swpp/database/CompilationEnv'
import {COMMON_TYPE_CROSS_DEP} from './swpp/database/CrossDepCode'
import {COMMON_TYPE_CROSS_ENV} from './swpp/database/CrossEnv'
import {COMMON_TYPE_RUNTIME_CORE} from './swpp/database/RuntimeCoreCode'
import {COMMON_KEY_RUNTIME_DEP} from './swpp/database/RuntimeDepCode'
import {COMMON_TYPE_RUNTIME_EVENT} from './swpp/database/RuntimeEventCode'
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
    SwppConfigCrossEnv, SwppConfigCompilationEnv, SwppConfigTemplate,
    defineCompilationEnv, defineConfig, defineCrossEnv, defineCrossDep,
    defineRuntimeDep, defineRuntimeCore, defineRuntimeEvent
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
export { CompilationEnv } from './swpp/database/CompilationEnv'

export namespace SwppType {

    export type RuntimeEventCode = COMMON_TYPE_RUNTIME_EVENT
    export type RuntimeCoreCode = COMMON_TYPE_RUNTIME_CORE
    export type RuntimeDepCode = COMMON_KEY_RUNTIME_DEP
    export type CrossEnv = COMMON_TYPE_CROSS_ENV
    export type CrossDep = COMMON_TYPE_CROSS_DEP
    export type CompilationEnv = COMMON_TYPE_COMP_ENV

}

utils.printInfo('INDEX', `欢迎使用 swpp@${version}`)