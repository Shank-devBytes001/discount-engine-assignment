/**
 * pdfCartParser.js
 *
 * Extracts cart items from a PDF table with columns:
 * Product, Brand, Platform, Base Price
 *
 * Returns { data: CartItem[], errors: string[] } — same contract as csvParser.
 */

const KNOWN_PLATFORMS = ['Amazon India', 'Flipkart', 'Noon']

function parseBasePrice(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/Rs\.?/gi, '').replace(/,/g, '').trim()
  const num = parseFloat(cleaned)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.round(num)
}

function extractPlatform(text) {
  const sorted = [...KNOWN_PLATFORMS].sort((a, b) => b.length - a.length)
  for (const platform of sorted) {
    const idx = text.lastIndexOf(platform)
    if (idx !== -1 && idx + platform.length === text.length) {
      return { platform, remainder: text.slice(0, idx).trim() }
    }
  }
  const parts = text.split(/\s{2,}/)
  if (parts.length >= 3) {
    return { platform: parts[parts.length - 1].trim(), remainder: parts.slice(0, -1).join('  ').trim() }
  }
  const words = text.trim().split(/\s+/)
  if (words.length >= 3) {
    return { platform: words[words.length - 1], remainder: words.slice(0, -1).join(' ') }
  }
  return null
}

function splitProductBrand(remainder) {
  const tabParts = remainder.split(/\s{2,}/)
  if (tabParts.length >= 2) {
    return { product: tabParts[0].trim(), brand: tabParts.slice(1).join(' ').trim() }
  }
  const words = remainder.trim().split(/\s+/)
  if (words.length >= 3) {
    return { product: words.slice(0, -2).join(' '), brand: words.slice(-2).join(' ') }
  }
  if (words.length === 2) {
    return { product: words[0], brand: words[1] }
  }
  return null
}

/**
 * Parses extracted PDF text into cart rows.
 * Handles both line-per-row PDFs and continuous text from pdf.js.
 */
export function parseCartTextFromPdf(text) {
  const normalized = text.replace(/\r?\n/g, ' ').replace(/[─\-=_|]+/g, ' ').replace(/\s+/g, ' ').trim()

  const headerMatch = normalized.match(/Product\s+Brand\s+Platform\s+Base\s+Price/i)
  if (!headerMatch) {
    return {
      data: [],
      errors: ['Could not find Product/Brand/Platform/Base Price header in PDF.'],
    }
  }

  let body = normalized.slice(headerMatch.index + headerMatch[0].length).trim()
  body = body.replace(/^Order\s*#\S+\s*Date:\s*[\w\s]+\s*/i, '')

  const data = []
  const errors = []
  let rowNum = 0
  let remaining = body

  while (remaining.length > 0) {
    const match = remaining.match(/^(.+?)\s+(Rs\.?\s*[\d,]+(?:\.\d+)?)\s*/i)
    if (!match) break

    rowNum += 1
    const lineContent = match[1].trim()
    const priceStr = match[2]
    remaining = remaining.slice(match[0].length)

    const basePrice = parseBasePrice(priceStr)
    if (basePrice == null) {
      errors.push(`Row ${rowNum}: could not parse base price "${priceStr.trim()}" — row skipped`)
      continue
    }

    const platformResult = extractPlatform(lineContent)
    if (!platformResult) {
      errors.push(`Row ${rowNum}: could not parse platform — row skipped`)
      continue
    }

    const brandResult = splitProductBrand(platformResult.remainder)
    if (!brandResult || !brandResult.product || !brandResult.brand) {
      errors.push(`Row ${rowNum}: could not parse product/brand — row skipped`)
      continue
    }

    data.push({
      itemId: `ITEM-PDF-${data.length + 1}`,
      product: brandResult.product,
      brand: brandResult.brand,
      platform: platformResult.platform,
      basePrice,
    })
  }

  return { data, errors }
}

/**
 * Reads a PDF file and extracts cart items from its table.
 */
export async function parsePdfCart(file) {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).href

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
    const textParts = []

    for (let page = 1; page <= pdf.numPages; page++) {
      const pageObj = await pdf.getPage(page)
      const content = await pageObj.getTextContent()
      const pageText = content.items.map((item) => item.str).join(' ')
      textParts.push(pageText)
    }

    const fullText = textParts.join('\n')
    const { data, errors } = parseCartTextFromPdf(fullText)

    if (data.length === 0) {
      return {
        data: [],
        errors: errors.length > 0
          ? errors
          : ['Could not extract any valid cart items from this PDF — check it matches the expected Product/Brand/Platform/Base Price table format.'],
      }
    }

    return { data, errors }
  } catch (err) {
    return {
      data: [],
      errors: [err.message || 'Failed to read PDF file.'],
    }
  }
}
