import fs from 'fs'
import {Stats} from 'node:fs'
import nodePath from 'path'

export class FilePath {

    /**
     * @param absPath 绝对路径
     * @param baseProject 相对于项目根目录的路径，如果路径不在项目范围内，则为 null
     * @param basePublic 相对于网站根目录的路径，如果路径不在网站范围内，则为 null
     * @private
     */
    constructor(
        public readonly absPath: string,
        public readonly baseProject: string|null,
        public readonly basePublic: string|null
    ) { }

    /**
     * 检查目录或文件是否存在
     */
    exists(): Promise<boolean> {
        return new Promise(resolve => {
            fs.access(this.absPath, fs.constants.F_OK, (err) => {
                resolve(!err)
            })
        })
    }

    private statCache: Stats | undefined

    /**
     * 检查路径是否指向一个目录
     */
    async isDirectory(): Promise<boolean> {
        if (!this.statCache)
            this.statCache = await fs.promises.stat(this.absPath)
        return this.statCache.isDirectory()
    }

    /**
     * 检查路径是否指向一个文件
     */
    async isFile(): Promise<boolean> {
        if (!this.statCache)
            this.statCache = await fs.promises.stat(this.absPath)
        return this.statCache.isFile()
    }

    /**
     * 将指定目录拼接到当前路径之后
     */
    append(subPath: string, ...subPaths: string[]): FilePath {
        const newAbsPath = nodePath.posix.join(this.absPath, subPath, ...subPaths)
        let newBaseProject: string | null = null
        let newBasePublic: string | null = null
        if (this.baseProject) {
            newBaseProject = nodePath.posix.join(this.baseProject, subPath, ...subPaths)
            newBaseProject = nodePath.posix.normalize(newBaseProject)
        }
        if (this.basePublic) {
            newBasePublic = nodePath.posix.join(this.basePublic, subPath, ...subPaths)
            newBasePublic = nodePath.posix.normalize(newBasePublic)
        }
        return new FilePath(newAbsPath, newBaseProject, newBasePublic)
    }

    /**
     * 将指定目录拼接到当前路径之后
     */
    join(subPath: string, ...subPaths: string[]): FilePath {
        return this.append(subPath, ...subPath)
    }

    /**
     * 获取指定路径相对于当前路径的相对路径
     * @param that
     */
    relative(that: string | FilePath): string {
        return nodePath.posix.relative(this.absPath, typeof that === 'string' ? that : that.absPath)
    }

    /**
     * 遍历当前路径下的所有文件（不含文件夹）
     * @param consumer
     */
    async walkAllFile(consumer: (filePath: FilePath) => Promise<void> | void) {
        const queue: FilePath[] = [this]
        do {
            const item = queue.pop()!
            const dirs = await fs.promises.readdir(item.absPath)
            for (let subPath of dirs) {
                const path = item.join(subPath)
                if (await path.isDirectory()) {
                    queue.push(path)
                } else {
                    await consumer(path)
                }
            }
        } while (queue.length)
    }

    /**
     * 获取文件名
     */
    fileName(): string {
        return nodePath.posix.basename(this.absPath)
    }

    /**
     * 获取上一级目录
     */
    parent(): FilePath {
        return FilePath.fromAbsPath(nodePath.posix.dirname(this.absPath))
    }

    /** 获取拓展名，包含 `.` */
    extname(): string {
        return nodePath.posix.extname(this.absPath)
    }

    /** 项目根目录 */
    static PROJECT_ROOT: FilePath
    /** 网站根目录 */
    static PUBLIC_ROOT: FilePath

    /**
     * 从绝对路径获取 FilePath
     * @param absPath
     */
    static fromAbsPath(absPath: string): FilePath {
        if (this.PROJECT_ROOT.absPath.startsWith(absPath)) {
            return this.PROJECT_ROOT.join(absPath.substring(this.PROJECT_ROOT.absPath.length))
        } else if (this.PUBLIC_ROOT.absPath.startsWith(absPath)) {
            return this.PUBLIC_ROOT.join(absPath.substring(this.PUBLIC_ROOT.absPath.length))
        } else {
            return new FilePath(absPath, null, null)
        }
    }

    /**
     * 从相对路径获取 FilePath，相对于项目根目录
     * @param that
     */
    static relativeProject(that: string): FilePath {
        const absPath = nodePath.posix.resolve(that)
        return new FilePath(absPath, '', null)
    }

}