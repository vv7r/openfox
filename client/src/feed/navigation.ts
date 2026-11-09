type ScrollToIndex = (index: number) => void

let scrollToIndex: ScrollToIndex | null = null

/** The mounted feed offers its scrolling here, for the search dialog. */
export function registerFeedScroll(scroll: ScrollToIndex): () => void {
  scrollToIndex = scroll
  return () => {
    if (scrollToIndex === scroll) scrollToIndex = null
  }
}

export function scrollFeedTo(index: number): void {
  scrollToIndex?.(index)
}
