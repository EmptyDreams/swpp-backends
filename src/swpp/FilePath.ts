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
    private constructor(
        public readonly absPath: string,
        public readonly baseProject: string|null,
        public readonly basePublic: string|null
    ) { }

    /**
     * 检查路径是否在网站范围内
     */
    get isPublic(): boolean {
        return this.basePublic != null
    }

    /**
     * 检查路径是否在项目范围内
     */
    get isProject(): boolean {
        return this.baseProject != null
    }

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
     * 将指定目录拼接到当前路径之后
     */
    append(subPath: string, ...subPaths: string[]): FilePath {
        const newAbsPath = nodePath.posix.join(this.absPath, subPath, ...subPaths)
        let newBaseProject: string | null = null
        let newBasePublic: string | null = null
        if (this.isProject) {
            newBaseProject = nodePath.posix.join(this.baseProject!, subPath, ...subPaths)
            newBaseProject = nodePath.posix.normalize(newBaseProject)
        }
        if (this.isPublic) {
            newBasePublic = nodePath.posix.join(this.basePublic!, subPath, ...subPaths)
            newBasePublic = nodePath.posix.normalize(newBasePublic)
        }
        return new FilePath(newAbsPath, newBaseProject, newBasePublic)
    }

    /**
     * 将指定目录拼接到当前路径之后
     */
    join(subPath: string, ...subPaths: string[]): FilePath {
        return this.append(subPath, ...subPaths)
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
     * 获取上一级目录
     */
    parent(): FilePath {
        let newBaseProject = this.baseProject ? nodePath.posix.dirname(this.baseProject) : null
        let newBasePublic = this.basePublic ? nodePath.posix.dirname(this.basePublic) : null
        if (newBaseProject === '.') newBaseProject = ''
        if (newBasePublic === '.') newBasePublic = ''
        return new FilePath(nodePath.posix.dirname(this.absPath), newBaseProject, newBasePublic)
    }

    /** 获取拓展名，包含 `.` */
    extname(): string {
        return nodePath.posix.extname(this.absPath)
    }

    /**
     * 创建目录（不包含当前目录，只创建父级目录）
     */
    async mkdirs() {
        const parent = this.parent()
        if (!await parent.exists()) {
            await fs.promises.mkdir(parent.absPath, { recursive: true})
        }
    }

    /** 空目录 */
    static EMPTY = new FilePath('', null, null)

    /**
     * 构建网站根目录的 FilePath
     * @param path 绝对路径或相对路径（相对于项目根目录），以 `/` 开头或 `x:/` 开头判定为绝对路径
     * @param projectRoot 项目根目录（绝对路径或相对路径（相对于工作目录））
     */
    static buildPublicRoot(path: string, projectRoot: FilePath): FilePath {
        if (!(path.startsWith('/') || nodePath.isAbsolute(path))) {
            path = nodePath.resolve(path)
        }
        const absPath = nodePath.posix.normalize(path)
        let baseProject = absPath.startsWith(projectRoot.absPath)
            ? absPath.substring(projectRoot.absPath.length) : null
        if (baseProject && (baseProject.startsWith('/') || baseProject.startsWith('\\'))) {
            baseProject = baseProject.substring(1)
        }
        if (baseProject) {
            baseProject = nodePath.posix.normalize(baseProject)
        }
        return new FilePath(absPath, baseProject, '')
    }

    /**
     * 构建项目根目录的 FilePath
     * @param path 绝对路径或相对路径（相对于工作目录）
     */
    static buildProjectRoot(path: string): FilePath {
        if (!(path.startsWith('/') || nodePath.isAbsolute(path))) {
            path = nodePath.resolve(path)
        }
        path = nodePath.posix.normalize(path)
        return new FilePath(path, '', null)
    }

}