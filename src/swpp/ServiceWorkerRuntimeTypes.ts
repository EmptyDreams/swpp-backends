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