import {readEjectData, getSource, fetchFile, replaceDevRequest, calcEjectValues} from './Utils'
import {
    isExclude,
    isStable,
    loadVersionJson,
    readOldVersionJson,
    readNewVersionJson,
    readMergeVersionMap,
    buildVersionJson,
    eachAllLinkInUrl,
    eachAllLinkInHtml,
    eachAllLinkInCss,
    eachAllLinkInJavaScript,
    findCache,
    replaceRequest
} from './FileAnalyzer'
import {buildServiceWorker} from './ServiceWorkerBuilder'
import {readRules, loadRules, addRulesMapEvent} from './SwppRules'
import {readUpdateJson, loadUpdateJson, submitChange, getShorthand, buildNewInfo} from './UpdateJsonBuilder'
import {refreshUrl, analyzer} from './VersionAnalyzer'

// noinspection JSUnusedGlobalSymbols
export default {
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
        analyzer
    },
    loader: {
        loadRules, loadUpdateJson, loadVersionJson
    },
    event: {
        addRulesMapEvent, refreshUrl, submitChange
    },
    utils: {
        getSource, getShorthand, findCache,
        fetchFile, replaceDevRequest, replaceRequest,
        isStable, isExclude,
        eachAllLinkInUrl, eachAllLinkInHtml, eachAllLinkInCss, eachAllLinkInJavaScript
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
export {AnalyzerResult} from './VersionAnalyzer'