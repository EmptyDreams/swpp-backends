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
console.log(
    builder.readSwCode(
        runtimeData, new SwCodeInject()
    )
)