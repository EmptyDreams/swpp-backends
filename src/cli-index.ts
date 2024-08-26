import {initCommand} from './swpp/cli'
import {utils} from './swpp/untils'

initCommand().catch(e => {
    utils.printError('COMMAND', '执行指令时出现异常')
    throw e
})