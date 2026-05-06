declare function getCurrentPages(): Array<{ route: string }>

export type LoadingType = 'initial_load' | 'route_change'

export class PageContextManager {
  private isFirstPageLoad = true

  /**
   * 通过 getCurrentPages() 获取上一页面路由作为 referrer
   */
  getReferrer(): string | undefined {
    const pages = getCurrentPages()
    if (pages.length < 2) {
      return undefined
    }
    const prevPage = pages[pages.length - 2]
    return prevPage.route
  }

  /**
   * 判断当前页面加载类型：
   * - initial_load: 小程序启动后加载的第一个页面
   * - route_change: 通过路由跳转打开的页面
   */
  getLoadingType(): LoadingType {
    const pages = getCurrentPages()
    if (this.isFirstPageLoad && pages.length <= 1) {
      this.isFirstPageLoad = false
      return 'initial_load'
    }
    return 'route_change'
  }

  /**
   * 重置状态（用于 wx.reLaunch 等场景）
   */
  reset() {
    this.isFirstPageLoad = true
  }
}
