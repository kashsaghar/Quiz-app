// Extracts "question number -> correct option letter" from a separately
// uploaded marking scheme / answer key file (PDF or .txt), so a teacher who
// has both the question paper and its mark scheme doesn't have to select
// 40 correct answers by hand.
//
// Supports the common exam-board table layout -- a row per question like
//   1   D   1
//   2   B   1
// (question number, answer letter, marks) -- as well as a compact inline
// format like "1-A, 2-C, 3-B" if that's all a teacher pastes/uploads.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { ANSWER_LIST_PAIR } from './quizParser'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// "1 D 1" or "1 A or B 1" or "1 A/B 1" -- number, answer, optional alternate
// answer, marks. Requiring the trailing marks number keeps this specific
// enough to never misfire on ordinary diagram/table text elsewhere in a PDF.
const MARK_SCHEME_ROW = /^\s*(\d{1,3})\s+([A-D])(?:\s*(?:or|\/)\s*([A-D]))?\s+\d+(?:\.\d+)?\s*$/i

async function getPageLines(page) {
  const content = await page.getTextContent()
  let lastY = null
  let current = null
  const lines = []
  for (const item of content.items) {
    const y = item.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (current) lines.push(current)
      current = null
    }
    if (!current) current = ''
    current += item.str
    lastY = y
    if (item.hasEOL) {
      lines.push(current)
      current = null
    }
  }
  if (current) lines.push(current)
  return lines
}

function parseTableRows(lines) {
  const answers = {}
  const alternates = {}
  for (const raw of lines) {
    const text = raw.trim()
    if (!text) continue
    const m = text.match(MARK_SCHEME_ROW)
    if (m) {
      answers[Number(m[1])] = m[2].toUpperCase()
      if (m[3]) alternates[Number(m[1])] = m[3].toUpperCase()
    }
  }
  return { answers, alternates }
}

export async function extractAnswerKeyFromFile(file) {
  const warnings = []
  let lines = []

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocument({ data: buffer }).promise
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      lines.push(...(await getPageLines(page)))
    }
  } else {
    const text = await file.text()
    lines = text.replace(/\r\n/g, '\n').split('\n')
  }

  let { answers, alternates } = parseTableRows(lines)

  if (Object.keys(answers).length === 0) {
    // Fall back to a compact inline format, e.g. "1-A, 2-C, 3-B".
    const joined = lines.join(', ')
    const fallback = {}
    let match
    ANSWER_LIST_PAIR.lastIndex = 0
    while ((match = ANSWER_LIST_PAIR.exec(joined)) !== null) {
      fallback[Number(match[1])] = match[2].toUpperCase()
    }
    answers = fallback
  }

  const count = Object.keys(answers).length
  if (count === 0) {
    warnings.push(
      'Could not detect any answers in this file. Expected rows like "1   D   1" (question, answer, marks) or a list like "1-A, 2-C, 3-B".'
    )
  }

  const alternateCount = Object.keys(alternates).length
  if (alternateCount > 0) {
    warnings.push(
      `${alternateCount} question(s) in the marking scheme accept more than one correct answer -- only the first option listed was applied. Please double-check those.`
    )
  }

  return { answers, warnings }
}
