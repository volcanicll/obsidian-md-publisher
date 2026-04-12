import { App, TFile } from 'obsidian'
import { WeChatApi } from './wechat/wechat-api'

export interface ImageProcessorOptions {
	maxWidth: number
	maxHeight: number
	maxSizeKB: number
	quality: number
}

export const DEFAULT_IMAGE_OPTIONS: ImageProcessorOptions = {
	maxWidth: 900,
	maxHeight: 2000,
	maxSizeKB: 1024,
	quality: 0.8,
}

export interface ImageProcessResult {
	originalPath: string
	wechatUrl: string
}

export type ProgressCallback = (current: number, total: number, filename: string) => void

/**
 * Extract local image paths from HTML content.
 * Matches <img src="..."> where src is a relative path or app:// path.
 */
export function extractLocalImagePaths(html: string): string[] {
	const paths: string[] = []
	const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
	let match: RegExpExecArray | null

	while ((match = imgRegex.exec(html)) !== null) {
		const src = match[1]
		// Skip external URLs and data URIs
		if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
			continue
		}
		paths.push(src)
	}

	return paths
}

/**
 * Normalize an Obsidian image src to a vault-relative path.
 * Handles formats:
 *   - app://<hash>/<absolute-path>
 *   - Relative paths like "images/photo.png"
 *   - Wikilink style like "![[](Pasted%20image.png)]"
 */
export function normalizeImagePath(
	src: string,
	activeFilePath: string | null
): string | null {
	let path = src

	// Handle app:// protocol (Obsidian desktop)
	const appMatch = path.match(/^app:\/\/[^/]+\/(.+)$/)
	if (appMatch) {
		path = decodeURIComponent(appMatch[1])
		// This is an absolute path, we need to make it vault-relative
		// But in Obsidian, we use vault.adapter to resolve
		return path
	}

	// URL decode
	path = decodeURIComponent(path)

	// Remove leading ./ if present
	if (path.startsWith('./')) {
		path = path.substring(2)
	}

	// If relative and we have active file, resolve relative to it
	if (!path.startsWith('/') && activeFilePath) {
		const dir = activeFilePath.substring(0, activeFilePath.lastIndexOf('/'))
		if (dir) {
			path = dir + '/' + path
		}
	}

	return path
}

/**
 * Read an image file from the vault and return its ArrayBuffer.
 */
export async function readImageFromVault(
	app: App,
	imagePath: string
): Promise<ArrayBuffer | null> {
	try {
		// Try as vault-relative path first
		const file = app.vault.getAbstractFileByPath(imagePath)
		if (file instanceof TFile) {
			return await app.vault.readBinary(file)
		}

		// Try with common image extensions
		const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
		for (const ext of extensions) {
			const tryPath = imagePath.endsWith(`.${ext}`)
				? imagePath
				: `${imagePath}.${ext}`
			const tryFile = app.vault.getAbstractFileByPath(tryPath)
			if (tryFile instanceof TFile) {
				return await app.vault.readBinary(tryFile)
			}
		}

		return null
	} catch {
		return null
	}
}

/**
 * Get image dimensions from ArrayBuffer
 */
function getImageDimensions(
	data: ArrayBuffer
): Promise<{ width: number; height: number }> {
	return new Promise((resolve) => {
		const blob = new Blob([data])
		const url = URL.createObjectURL(blob)
		const img = new Image()
		img.onload = () => {
			resolve({ width: img.naturalWidth, height: img.naturalHeight })
			URL.revokeObjectURL(url)
		}
		img.onerror = () => {
			resolve({ width: 0, height: 0 })
			URL.revokeObjectURL(url)
		}
		img.src = url
	})
}

/**
 * Compress and resize image to meet requirements.
 * Uses Canvas API for resizing and quality adjustment.
 */
export async function compressImage(
	imageData: ArrayBuffer,
	options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS
): Promise<ArrayBuffer> {
	const dims = await getImageDimensions(imageData)

	// No need to resize if within limits and size is OK
	const sizeKB = imageData.byteLength / 1024
	if (
		dims.width <= options.maxWidth &&
		dims.height <= options.maxHeight &&
		sizeKB <= options.maxSizeKB
	) {
		return imageData
	}

	return new Promise((resolve, reject) => {
		const blob = new Blob([imageData])
		const url = URL.createObjectURL(blob)
		const img = new Image()

		img.onload = () => {
			let { width, height } = img

			// Calculate new dimensions maintaining aspect ratio
			if (width > options.maxWidth) {
				height = Math.round((height * options.maxWidth) / width)
				width = options.maxWidth
			}
			if (height > options.maxHeight) {
				width = Math.round((width * options.maxHeight) / height)
				height = options.maxHeight
			}

			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height

			const ctx = canvas.getContext('2d')
			if (!ctx) {
				URL.revokeObjectURL(url)
				reject(new Error('Canvas context unavailable'))
				return
			}

			ctx.drawImage(img, 0, 0, width, height)

			canvas.toBlob(
				(blob) => {
					URL.revokeObjectURL(url)
					if (blob) {
						blob.arrayBuffer().then(resolve).catch(reject)
					} else {
						reject(new Error('Image compression failed'))
					}
				},
				'image/jpeg',
				options.quality
			)
		}

		img.onerror = () => {
			URL.revokeObjectURL(url)
			reject(new Error('Failed to load image for compression'))
		}

		img.src = url
	})
}

/**
 * Process all local images in HTML content:
 * 1. Extract local image paths
 * 2. Read from vault
 * 3. Compress if needed
 * 4. Upload to WeChat
 * 5. Replace URLs in HTML
 *
 * @returns Processed HTML with WeChat URLs and list of results
 */
export async function processImages(
	html: string,
	app: App,
	api: WeChatApi,
	activeFilePath: string | null,
	options: ImageProcessorOptions = DEFAULT_IMAGE_OPTIONS,
	onProgress?: ProgressCallback
): Promise<{ html: string; results: ImageProcessResult[]; errors: string[] }> {
	const localPaths = extractLocalImagePaths(html)

	if (localPaths.length === 0) {
		return { html, results: [], errors: [] }
	}

	const results: ImageProcessResult[] = []
	const errors: string[] = []
	let processedHtml = html
	let current = 0

	for (const rawPath of localPaths) {
		current++
		const normalizedPath = normalizeImagePath(rawPath, activeFilePath)

		if (!normalizedPath) {
			errors.push(`Could not normalize path: ${rawPath}`)
			continue
		}

		const filename = normalizedPath.split('/').pop() || 'image.png'

		if (onProgress) {
			onProgress(current, localPaths.length, filename)
		}

		// Read image from vault
		const imageData = await readImageFromVault(app, normalizedPath)
		if (!imageData) {
			errors.push(`Image not found in vault: ${normalizedPath}`)
			continue
		}

		// Compress if needed
		let processedData: ArrayBuffer
		try {
			processedData = await compressImage(imageData, options)
		} catch (err) {
			errors.push(`Failed to compress ${filename}: ${err}`)
			// Use original data as fallback
			processedData = imageData
		}

		// Upload to WeChat
		try {
			const wechatUrl = await api.uploadImage(processedData, filename)

			// Replace in HTML — escape special regex chars in rawPath
			const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			processedHtml = processedHtml.replace(
				new RegExp(`(src=["'])${escapedPath}(["'])`, 'g'),
				`$1${wechatUrl}$2`
			)

			results.push({
				originalPath: normalizedPath,
				wechatUrl,
			})
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			errors.push(`Failed to upload ${filename}: ${msg}`)
		}
	}

	return { html: processedHtml, results, errors }
}
