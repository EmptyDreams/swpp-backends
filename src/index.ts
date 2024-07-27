import fs from 'fs'
import {CrossDepCode} from './swpp/database/CrossDepCode'
import {RuntimeDepCode} from './swpp/database/RuntimeDepCode'
import {RuntimeEnv} from './swpp/database/RuntimeEnv'
import {SwCodeInject} from './swpp/SwCodeInject'
import {RuntimeData, SwCompiler} from './swpp/SwCompiler'

const builder = new SwCompiler()
const runtimeData: RuntimeData = {
    runtimeEnv: new RuntimeEnv(),
    runtimeDep: new RuntimeDepCode(),
    crossDep: new CrossDepCode()
}
const content = builder.readSwCode(
    runtimeData, new SwCodeInject()
)
fs.writeFileSync('D:/Desktop/a.txt', content, 'utf8')