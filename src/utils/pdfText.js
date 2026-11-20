import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Extracts plain text from a PDF File, preserving rough line breaks so the
// quiz parser can still find numbered questions/options.
export async function extractTextFromPdf(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise

  const pageTexts = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
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
    pageTexts.push(lines.join('\n'))
  }

  return pageTexts.join('\n')
}
