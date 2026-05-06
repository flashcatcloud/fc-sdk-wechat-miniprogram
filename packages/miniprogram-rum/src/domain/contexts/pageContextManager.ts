declare function getCurrentPages(): Array<{ route: string }>

export type LoadingType = 'initial_load' | 'route_change'

export class PageContextManager {
  private isFirstPageLoad = true

  /**
   * Reset state (for wx.reLaunch and similar scenarios where the page stack is cleared).
   * Called automatically when a new page loads with an empty page stack after the first page has loaded.
   */
  resetIfNeeded() {
    const pages = getCurrentPages()
    if (!this.isFirstPageLoad && pages.length <= 1) {
      this.isFirstPageLoad = true
    }
  }

  /**
   * Get the previous page route as referrer via getCurrentPages()
   */
  getReferrer(): string | undefined {
    const pages = getCurrentPages()
    if (pages.length < 2) {
      return undefined
    }
    const prevPage = pages[pages.length - 2]
    return prevPage.route
  }

  getLoadingType(): LoadingType {
    const pages = getCurrentPages()
    if (this.isFirstPageLoad && pages.length <= 1) {
      this.isFirstPageLoad = false
      return 'initial_load'
    }
    return 'route_change'
  }
}
