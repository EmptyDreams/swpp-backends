import {utils} from './swpp/untils'

/** 版本号 */
export const version = require('../package.json').version

utils.printInfo('INDEX', `欢迎使用 swpp@${version}`)