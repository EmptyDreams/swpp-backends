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
import {loadUpdateJson, submitChange, getShorthand, buildUpdateJson} from './UpdateJsonBuilder'
import {
    readMergeVersionMap,
    readNewVersionJson,
    readOldVersionJson,
    readRules,
    readUpdateJson,
    readAnalyzeResult,
    writeVariant,
    readVariant,
    deleteVariant
} from './Variant'
import {refreshUrl, analyzeVersion} from './VersionAnalyzer'
import {buildDomJs} from './DomBuilder'

// noinspection JSUnusedGlobalSymbols
export default {
    version: '2.1.7-beta.1',
    cache: {
        readEjectData, readUpdateJson,
        readRules, readMergeVersionMap,
        readOldVersionJson, readNewVersionJson,
        readAnalyzeResult
    },
    builder: {
        buildServiceWorker,
        buildDomJs,
        buildVersionJson,
        buildUpdateJson,
        calcEjectValues,
        analyzeVersion
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
        eachAllLinkInUrl, deepFreeze, writeVariant, readVariant, deleteVariant
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