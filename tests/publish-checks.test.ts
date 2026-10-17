import { describe, it, expect, afterEach } from 'vitest'
import {
  collectIssues,
  emptyReport,
  extractHrefs,
  runChecks,
  type CheckReport
} from '../src/views/publish/publish-checks'
import { setRequestUrlMock } from './obsidian-stub'

// publish-checks 依赖 validation 中的 window.setTimeout
;(globalThis as Record<string, unknown>).window = globalThis

afterEach(() => {
  setRequestUrlMock(null)
})

describe('extractHrefs', () => {
  it('dedupes http links and ignores relative or mailto links', () => {
    const html = `
      <p><a href="https://a.test/1">1</a></p>
      <p><a href="https://a.test/1">again</a></p>
      <p><a href="https://b.test/2?x=1&amp;y=2">2</a></p>
      <p><a href="/relative">r</a> <a href="mailto:a@b.test">m</a></p>
    `
    expect(extractHrefs(html)).toEqual(['https://a.test/1', 'https://b.test/2?x=1&amp;y=2'])
  })

  it('returns an empty list when there are no links', () => {
    expect(extractHrefs('<p>没有链接</p>')).toEqual([])
  })
})

describe('emptyReport', () => {
  it('marks both checks as not yet run', () => {
    expect(emptyReport()).toEqual({ links: null, words: null, ranAt: null })
  })
})

describe('runChecks', () => {
  it('reports links and words independently, then stamps ranAt', async () => {
    setRequestUrlMock(async () => ({ json: '', status: 200 }) as never)

    const partials: CheckReport[] = []
    const report = await runChecks(
      {
        html: '<p>全网最低价 <a href="https://ok.test">链接</a></p>',
        title: '标题',
        digest: '',
        contentSourceUrl: '',
        extraWords: []
      },
      (partial) => partials.push(partial)
    )

    expect(report.links).toEqual([{ url: 'https://ok.test', ok: true, status: 200 }])
    expect(report.words?.some((hit) => hit.word === '全网最低')).toBe(true)
    expect(report.ranAt).not.toBeNull()

    // 每项检查完成时各回调一次，全部完成后补一次；至少 3 次
    expect(partials.length).toBeGreaterThanOrEqual(3)
    const intermediate = partials[partials.length - 2]
    expect(intermediate.ranAt).toBeNull()
  })

  it('treats a clean article with no links as zero work', async () => {
    let networkCalls = 0
    setRequestUrlMock(async () => {
      networkCalls++
      return { json: '', status: 200 } as never
    })

    const report = await runChecks(
      {
        html: '<p>今天天气不错</p>',
        title: '标题',
        digest: '摘要',
        contentSourceUrl: '',
        extraWords: []
      },
      () => {}
    )

    expect(networkCalls).toBe(0)
    expect(report.links).toEqual([])
    expect(report.words).toEqual([])
  })

  it('includes the content source url in the link check', async () => {
    const checked: string[] = []
    setRequestUrlMock(async (param) => {
      checked.push(param.url)
      return { json: '', status: 200 } as never
    })

    await runChecks(
      {
        html: '<p>无链接</p>',
        title: '标题',
        digest: '',
        contentSourceUrl: 'https://source.test/post',
        extraWords: []
      },
      () => {}
    )

    expect(checked).toEqual(['https://source.test/post'])
  })

  it('ignores a non-http content source url', async () => {
    let networkCalls = 0
    setRequestUrlMock(async () => {
      networkCalls++
      return { json: '', status: 200 } as never
    })

    const report = await runChecks(
      {
        html: '<p>无链接</p>',
        title: '标题',
        digest: '',
        contentSourceUrl: 'obsidian://open?vault=x',
        extraWords: []
      },
      () => {}
    )

    expect(networkCalls).toBe(0)
    expect(report.links).toEqual([])
  })

  it('scans title and digest in addition to the body', async () => {
    const report = await runChecks(
      {
        html: '<p>正文</p>',
        title: '全网最低',
        digest: '稳赚不赔',
        contentSourceUrl: '',
        extraWords: []
      },
      () => {}
    )
    const words = (report.words ?? []).map((hit) => hit.word)
    expect(words).toContain('全网最低')
    expect(words).toContain('稳赚')
  })

  it('uses extra words from settings', async () => {
    const report = await runChecks(
      {
        html: '<p>内部代号</p>',
        title: '',
        digest: '',
        contentSourceUrl: '',
        extraWords: ['内部代号']
      },
      () => {}
    )
    expect(report.words?.some((hit) => hit.category === '自定义')).toBe(true)
  })

  it('leaves failed links in the report instead of throwing', async () => {
    setRequestUrlMock(async () => {
      throw new Error('DNS failure')
    })

    const report = await runChecks(
      {
        html: '<a href="https://bad.test">x</a>',
        title: '',
        digest: '',
        contentSourceUrl: '',
        extraWords: []
      },
      () => {}
    )
    expect(report.links).toEqual([
      { url: 'https://bad.test', ok: false, error: 'DNS failure' }
    ])
  })
})

describe('collectIssues', () => {
  it('lists nothing for a clean report', () => {
    expect(collectIssues({ links: [], words: [], ranAt: 1 })).toEqual([])
  })

  it('lists nothing before checks have run', () => {
    expect(collectIssues(emptyReport())).toEqual([])
  })

  it('describes failed links with status or error', () => {
    const issues = collectIssues({
      links: [
        { url: 'https://bad.test/404', ok: false, status: 404 },
        { url: 'https://bad.test/timeout', ok: false, error: '请求超时' },
        { url: 'https://ok.test', ok: true }
      ],
      words: [],
      ranAt: 1
    })
    expect(issues).toHaveLength(2)
    expect(issues[0].kind).toBe('link')
    expect(issues[0].label).toBe('链接')
    expect(issues[0].detail).toContain('https://bad.test/404')
    expect(issues[0].detail).toContain('HTTP 404')
    expect(issues[1].detail).toContain('请求超时')
  })

  it('describes sensitive hits with count, category and context', () => {
    const issues = collectIssues({
      links: [],
      words: [{ word: '最佳', category: '极限用语', count: 2, context: '…最佳方案…' }],
      ranAt: 1
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].kind).toBe('word')
    expect(issues[0].label).toBe('敏感词')
    expect(issues[0].detail).toContain('最佳')
    expect(issues[0].detail).toContain('×2')
    expect(issues[0].detail).toContain('极限用语')
    expect(issues[0].detail).toContain('最佳方案')
  })

  it('lists links before words', () => {
    const issues = collectIssues({
      links: [{ url: 'https://bad.test', ok: false, error: 'x' }],
      words: [{ word: '最佳', category: '极限用语', count: 1, context: '最佳' }],
      ranAt: 1
    })
    expect(issues.map((issue) => issue.kind)).toEqual(['link', 'word'])
  })
})
