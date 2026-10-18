import { describe, it, expect } from 'vitest'
import { LatestTask } from '../src/lib/latest-task'

/** 手动控制何时完成的 promise，用来复现「先发后到」的时序 */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('LatestTask', () => {
  it('only applies the last result when an older task resolves later', async () => {
    const task = new LatestTask<string>()
    const applied: string[] = []
    const first = deferred<string>()
    const second = deferred<string>()

    task.run(() => first.promise, (value) => applied.push(value))
    task.run(() => second.promise, (value) => applied.push(value))

    // 后发的先完成，先发的后完成：旧结果必须被丢弃
    second.resolve('theme-b')
    await second.promise
    first.resolve('theme-a')
    await first.promise
    await task.whenIdle()

    expect(applied).toEqual(['theme-b'])
  })

  it('reports pending until the last task settles', async () => {
    const task = new LatestTask<number>()
    const work = deferred<number>()
    expect(task.pending).toBe(false)

    void task.run(() => work.promise, () => {})
    expect(task.pending).toBe(true)

    work.resolve(1)
    await task.whenIdle()
    expect(task.pending).toBe(false)
  })

  it('ignores errors from superseded tasks', async () => {
    const task = new LatestTask<string>()
    const errors: unknown[] = []
    const stale = deferred<string>()
    const fresh = deferred<string>()

    task.run(
      () => stale.promise,
      () => {},
      (error) => errors.push(error)
    )
    task.run(
      () => fresh.promise,
      () => {},
      (error) => errors.push(error)
    )

    fresh.resolve('ok')
    await fresh.promise
    stale.reject(new Error('stale failure'))
    await task.whenIdle()

    expect(errors).toEqual([])
  })

  it('reports the error of the latest task', async () => {
    const task = new LatestTask<string>()
    const errors: unknown[] = []

    await task.run(
      () => Promise.reject(new Error('render failed')),
      () => {},
      (error) => errors.push(error)
    )

    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe('render failed')
    expect(task.pending).toBe(false)
  })

  it('whenIdle resolves immediately when nothing is running', async () => {
    const task = new LatestTask<string>()
    await expect(task.whenIdle()).resolves.toBeUndefined()
  })
})
