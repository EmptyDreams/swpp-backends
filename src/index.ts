import fs from 'fs'
import {RuntimeData, SwCompiler} from './swpp/SwCompiler'

const builder = new SwCompiler()
const runtimeData = new RuntimeData()
const content = builder.buildSwCode(runtimeData)
fs.writeFileSync('D:/Desktop/a.js', content, 'utf8')