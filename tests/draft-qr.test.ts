import { describe, it, expect } from 'vitest'
import { createQrSvg, isPreviewUrlUsable } from '../src/lib/wechat/draft-qr'

const SAMPLE_URL =
  'https://mp.weixin.qq.com/s?__biz=MzYzNTY1MzEwMw==&tempkey=MTM5Nl9VSjFiN0tvS1VEUkMrMW1x&chksm=708d1fe447fa96f2#rd'

describe('createQrSvg', () => {
  it('returns an svg document', () => {
    const svg = createQrSvg(SAMPLE_URL)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('sizes the viewBox from module count plus quiet zone', () => {
    const svg = createQrSvg(SAMPLE_URL, { cellSize: 4, margin: 2 })
    const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
    expect(viewBox).not.toBeNull()
    const size = Number(viewBox![1])
    expect(size % 4).toBe(0)
    // 静区占两边的 margin
    expect(size).toBeGreaterThan(21 * 4)
  })

  it('keeps a white background and black modules regardless of theme', () => {
    const svg = createQrSvg(SAMPLE_URL)
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('fill="#000000"')
  })

  it('draws modules as a single path', () => {
    const svg = createQrSvg(SAMPLE_URL)
    const path = svg.match(/<path d="([^"]*)"/)
    expect(path).not.toBeNull()
    expect((path![1].match(/M/g) || []).length).toBeGreaterThan(100)
  })

  it('grows with longer content', () => {
    const short = createQrSvg('https://a.com/x')
    const long = createQrSvg(SAMPLE_URL + '&extra=' + 'a'.repeat(300))
    const sizeOf = (svg: string): number =>
      Number(svg.match(/viewBox="0 0 (\d+)/)![1])
    expect(sizeOf(long)).toBeGreaterThan(sizeOf(short))
  })

  it('honours cell size and margin options', () => {
    const small = createQrSvg(SAMPLE_URL, { cellSize: 2, margin: 0 })
    const big = createQrSvg(SAMPLE_URL, { cellSize: 8, margin: 4 })
    const sizeOf = (svg: string): number =>
      Number(svg.match(/viewBox="0 0 (\d+)/)![1])
    expect(sizeOf(big)).toBeGreaterThan(sizeOf(small))
  })
})

describe('isPreviewUrlUsable', () => {
  it('accepts a real draft preview url', () => {
    expect(isPreviewUrlUsable(SAMPLE_URL)).toBe(true)
  })

  it('rejects empty and missing values', () => {
    expect(isPreviewUrlUsable('')).toBe(false)
    expect(isPreviewUrlUsable('   ')).toBe(false)
    expect(isPreviewUrlUsable(null)).toBe(false)
    expect(isPreviewUrlUsable(undefined)).toBe(false)
  })

  it('rejects non-http values', () => {
    expect(isPreviewUrlUsable('ftp://x/y')).toBe(false)
    expect(isPreviewUrlUsable('javascript:alert(1)')).toBe(false)
    expect(isPreviewUrlUsable('mp.weixin.qq.com/s?x=1')).toBe(false)
  })

  it('rejects a bare domain with no article path', () => {
    expect(isPreviewUrlUsable('https://mp.weixin.qq.com/')).toBe(false)
    expect(isPreviewUrlUsable('https://mp.weixin.qq.com')).toBe(false)
  })

  it('rejects malformed urls instead of throwing', () => {
    expect(isPreviewUrlUsable('https://')).toBe(false)
  })
})
