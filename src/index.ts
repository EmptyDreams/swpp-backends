import {readEjectData, getSource, fetchFile, replaceDevRequest, calcEjectValues, deepFreeze} from './Utils'
import {
    isExclude,
    isStable,
    loadVersionJson,
    buildVersionJson,
    eachAllLinkInUrl,
    findCache,
    findFileHandler,
    replaceRequest,
    submitCacheInfo,
    submitExternalUrl,
    registryFileHandler
} from './FileAnalyzer'
import {buildServiceWorker} from './ServiceWorkerBuilder'
import {loadRules, addRulesMapEvent} from './SwppRules'
import {loadUpdateJson, submitChange, getShorthand, buildNewInfo} from './UpdateJsonBuilder'
import {
    readMergeVersionMap,
    readNewVersionJson,
    readOldVersionJson,
    readRules,
    readUpdateJson,
    readAnalyzeResult,
    createVariant,
    readVariant,
    deleteVariant
} from './Variant'
import {refreshUrl, analyze} from './VersionAnalyzer'

// noinspection JSUnusedGlobalSymbols
export default {
    version: '1.2.3',
    cache: {
        readEjectData, readUpdateJson,
        readRules, readMergeVersionMap,
        readOldVersionJson, readNewVersionJson,
        readAnalyzeResult
    },
    builder: {
        buildServiceWorker,
        buildVersionJson,
        buildNewInfo,
        calcEjectValues,
        analyze
    },
    loader: {
        loadRules, loadUpdateJson, loadVersionJson
    },
    event: {
        addRulesMapEvent, refreshUrl, submitChange, submitCacheInfo, submitExternalUrl, registryFileHandler
    },
    utils: {
        getSource, getShorthand, findCache,
        fetchFile, replaceDevRequest, replaceRequest,
        isStable, isExclude, findFileHandler,
        eachAllLinkInUrl, deepFreeze, createVariant, readVariant, deleteVariant
    }
}

// types
export {EjectCache} from './Utils'
export {VersionJson, VersionMap} from './FileAnalyzer'
export {
    ServiceWorkerConfig,
    SwppConfig,
    SwppConfigTemplate,
    DomConfig,
    VersionJsonConfig,
    RegisterConfig,
    ExternalMonitorConfig
} from './SwppConfig'
export {SwppRules, CacheRules, SpareURLs, EjectValue} from './SwppRules'
export {UpdateJson, UpdateVersionInfo, FlagStr, ChangeExpression} from './UpdateJsonBuilder'
export {AnalyzeResult} from './VersionAnalyzer'