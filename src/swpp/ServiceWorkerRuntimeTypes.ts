export interface BrowserVersion {
    /** 逃生门版本号 */
    escape: number,
    /** 静态版本号 */
    global: number,
    /** 动态版本号 */
    local: number,
    /** 时间戳 */
    tp?: number
}

export interface UpdateInfo {
    /** 新的版本号 */
    new: BrowserVersion,
    /** 旧的版本号 */
    old?: BrowserVersion,
    /** 刷新的 URL 列表 */
    list?: string[]
}