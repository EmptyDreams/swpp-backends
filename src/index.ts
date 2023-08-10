import {readEjectData, getSource, fetchFile, replaceDevRequest, calcEjectValues, deepFreeze} from './Utils'
import {
    isExclude,
    isStable,
    loadVersionJson,
    readOldVersionJson,
    readNewVersionJson,
    readMergeVersionMap,
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
import {readRules, loadRules, addRulesMapEvent} from './SwppRules'
import {readUpdateJson, loadUpdateJson, submitChange, getShorthand, buildNewInfo} from './UpdateJsonBuilder'
import {refreshUrl, analyze} from './VersionAnalyzer'

// noinspection JSUnusedGlobalSymbols
export default {
    version: '1.1.2',
    cache: {
        readEjectData, readUpdateJson,
        readRules, readMergeVersionMap,
        readOldVersionJson, readNewVersionJson
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
        eachAllLinkInUrl, deepFreeze
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