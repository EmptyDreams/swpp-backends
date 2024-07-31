import fs from 'fs'
import {RuntimeData, SwCompiler} from './swpp/SwCompiler'

const builder = new SwCompiler()
const runtimeData = new RuntimeData()
const content = builder.buildSwCode(runtimeData)
fs.writeFileSync('D:/Desktop/a.js', content, 'utf8')

import {CompilationEnv} from './swpp/database/CompilationEnv'
import {KeyValueDatabase} from './swpp/database/KeyValueDatabase'

// const a = (a: number) => {
//     console.log(a)
// }
//
// a.call(2, 5)