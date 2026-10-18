/**
 * 只认最后一次的异步任务队列。
 *
 * 用于「用户连续操作、每次都触发一次耗时计算」的场景：只有最后一次的
 * 结果允许落地，先发后到的旧结果必须丢弃。同时提供 whenIdle()，让
 * 依赖最新结果的后续动作（例如发布）能等到计算真正结束。
 */
export class LatestTask<T> {
  private token = 0
  private inFlight: Promise<void> | null = null
  private running = false

  /** 是否还有未完成的计算 */
  get pending(): boolean {
    return this.running
  }

  /**
   * 开始一次计算。onResult 只在本次仍是最新一次时调用；
   * onError 同理，避免过期失败打断用户。
   */
  run(
    work: () => Promise<T>,
    onResult: (value: T) => void,
    onError?: (error: unknown) => void
  ): Promise<void> {
    const token = ++this.token
    this.running = true

    const task = work()
      .then((value) => {
        if (token !== this.token) return
        onResult(value)
      })
      .catch((error) => {
        if (token !== this.token) return
        onError?.(error)
      })
      .finally(() => {
        // 只有最后一次结束时才把状态归零：更早的任务不改变 pending
        if (token !== this.token) return
        this.running = false
        this.inFlight = null
      })

    this.inFlight = task
    return task
  }

  /** 等待在途计算结束；没有在途任务时立即返回 */
  async whenIdle(): Promise<void> {
    while (this.inFlight) {
      await this.inFlight
    }
  }
}
