import fs from 'fs'
import {SwCodeInject} from './swpp/SwCodeInject'
import {RuntimeData, SwCompiler} from './swpp/SwCompiler'

const builder = new SwCompiler()
const runtimeData = new RuntimeData()
const content = builder.readSwCode(
    runtimeData, new SwCodeInject()
)
fs.writeFileSync('D:/Desktop/a.txt', content, 'utf8')