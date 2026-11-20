import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { createWorker } from 'tesseract.js'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// A page with a real text layer typically has far more than this many
// characters per page. Below this, we treat it as a scanned/image-only page
// and fall back to OCR instead.
const MIN_CHARS_FOR_TEXT_LAYER = 20

async function extractPageTextLayer(page) {
  const content = await page.getTextContent()

  let lastY = null
  let lineText = ''
  const lines = []
  for (const item of content.items) {
    if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
      lines.push(lineText)
      lineText = ''
    }
    lineText += item.str
    if (item.hasEOL) {
      lines.push(lineText)
      lineText = ''
    }
    lastY = item.transform[5]
  }
  if (lineText) lines.push(lineText)
  return lines.join('\n')
}

async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas
}

// Extracts plain text from a PDF File. Pages with a normal text layer are
// read directly (fast, exact). Pages that look image-only (scanned pages,
// or a PDF made entirely of images) are rendered to a canvas and OCR'd with
// Tesseract.js instead, since pdfjs's text layer is empty for those.
//
// onProgress({ stage, page, totalPages }) is called as work proceeds, with
// stage one of 'reading' | 'ocr-init' | 'ocr', so the caller can show
// something better than a frozen spinner during the (slower) OCR path.
export async function extractTextFromPdf(file, { onProgress } = {}) {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise

  const pageTexts = []
  let ocrWorker = null
  let usedOcr = false

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      onProgress?.({ stage: 'reading', page: pageNum, totalPages: pdf.numPages })
      const page = await pdf.getPage(pageNum)
      const layerText = await extractPageTextLayer(page)

      if (layerText.trim().length >= MIN_CHARS_FOR_TEXT_LAYER) {
        pageTexts.push(layerText)
        continue
      }

      // Likely a scanned/image-only page — fall back to OCR. The worker is
      // created lazily so text-only PDFs never pay for it.
      if (!ocrWorker) {
        onProgress?.({ stage: 'ocr-init' })
        ocrWorker = await createWorker('eng')
      }
      usedOcr = true
      onProgress?.({ stage: 'ocr', page: pageNum, totalPages: pdf.numPages })

      const canvas = await renderPageToCanvas(page)
      const { data } = await ocrWorker.recognize(canvas)
      pageTexts.push(data.text)
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate()
  }

  return { text: pageTexts.join('\n'), usedOcr }
}
