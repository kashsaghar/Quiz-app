// Extracts a structured quiz directly from a PDF: question text, options,
// and (best-effort) a cropped snapshot image for any question that appears
// to include a diagram, graph, or table -- content a plain-text parser
// can't represent.
//
// This is deliberately a "best effort + human review" extractor, not a
// perfect one: real exam/question-bank PDFs vary wildly in layout (some
// punctuate "1. ..." / "A) ...", some just use "1 ..." / "A ...", some cram
// all four options onto one line, some lay options out as a 2x2 grid of
// small graphs with no distinguishing text at all). Every question this
// extractor produces is always surfaced for the teacher's Review & Edit
// step -- a question it can't confidently fill in still appears, with
// blank option slots and (when available) a snapshot image, rather than
// silently vanishing.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { createWorker } from 'tesseract.js'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Markers with an unambiguous punctuation separator -- e.g. "1. ..." or
// "A) ...". These can be trusted immediately, no lookahead needed.
const QUESTION_START_STRICT = /^\s*(?:q\.?\s*)?(\d{1,3})\s*[.)-]\s+(.+)$/i
const OPTION_LINE_STRICT = /^\s*\(?([a-dA-D])\)?\s*[.):-]\s+(.+)$/

// Markers with NO punctuation -- just "1 ..." or "A ...". On their own
// these are ambiguous (plenty of ordinary sentences start with a number or
// the word "A"), so they're only trusted once confirmed below.
const QUESTION_START_LOOSE = /^\s*(\d{1,3})\s+(.+)$/
const OPTION_LINE_LOOSE = /^\s*([a-dA-D])\s+(.+)$/

// Some layouts put all four options on one line with no punctuation at
// all, e.g. "A 20 m B 25 m C 30 m D 40 m".
const CRAMMED_OPTIONS_LINE = /^\s*A\s+(.+?)\s+B\s+(.+?)(?:\s+C\s+(.+?))?(?:\s+D\s+(.+))?$/

const ANSWER_KEY_HEADER = /^\s*answer(?:s)?\s*(?:key)?\s*:?\s*$/i
const INLINE_ANSWER = /^\s*(?:ans(?:wer)?)\s*[:.-]\s*\(?([a-dA-D])\)?\s*$/i
const ANSWER_LIST_PAIR = /(\d{1,3})\s*[-:.]\s*\(?([a-dA-D])\)?/gi

// Running headers/footers (exam code, copyright line) that repeat on every
// page and must never be mistaken for question content.
const HEADER_FOOTER_LINE = /©\s*UCLES|\b\d{4}\/\d+\/[A-Z]+\/[A-Z]+\/\d+\b/i

const MIN_CHARS_FOR_TEXT_LAYER = 20 // below this, treat the page as scanned and OCR it instead
const FRAGMENT_LINE_MAX_CHARS = 18 // short scattered lines are likely diagram captions/axis labels
const MIN_FRAGMENTS_FOR_DIAGRAM = 2
const RENDER_SCALE = 2

let idCounter = 0
function nextId() {
  idCounter += 1
  return `pdf-q-${Date.now()}-${idCounter}`
}

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
    if (!current) current = { text: '', y }
    current.text += item.str
    lastY = y
    if (item.hasEOL) {
      lines.push(current)
      current = null
    }
  }
  if (current) lines.push(current)
  return lines
}

async function renderPageCanvas(page, scale = RENDER_SCALE) {
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return { canvas, viewport }
}

function cropCanvasToBlob(sourceCanvas, viewport, userYTop, userYBottom, padding = 8) {
  const pxTop = viewport.convertToViewportPoint(0, userYTop)[1]
  const pxBottom = viewport.convertToViewportPoint(0, userYBottom)[1]
  const y0 = Math.max(0, Math.floor(Math.min(pxTop, pxBottom) - padding))
  const y1 = Math.min(sourceCanvas.height, Math.ceil(Math.max(pxTop, pxBottom) + padding))
  const height = Math.max(1, y1 - y0)

  const out = document.createElement('canvas')
  out.width = sourceCanvas.width
  out.height = height
  out.getContext('2d').drawImage(sourceCanvas, 0, y0, sourceCanvas.width, height, 0, 0, sourceCanvas.width, height)
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'))
}

export async function extractQuizFromPdf(file, { onProgress } = {}) {
  const buffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: buffer }).promise

  const questions = []
  const warnings = []
  let current = null
  let lastQuestionNumber = 0
  let answerKeyMode = false
  const answerKeyLines = []
  let pendingLooseOption = null
  let fragments = []
  let usedOcr = false
  let ocrWorker = null

  const nextOptionLetter = () => {
    const have = current ? Object.keys(current.options).length : 0
    return String.fromCharCode(65 + have)
  }
  const expectedNextNumber = () => (current ? current.number : lastQuestionNumber) + 1

  const setOption = (letter, text, y, pageNum) => {
    current.options[letter] = text.trim()
    current.lastOptionLetter = letter
    current.lastOptionPage = pageNum
    if (current.firstOptionY === undefined) current.firstOptionY = y
  }

  const pushCurrent = () => {
    if (current) {
      const count = Object.keys(current.options).length
      if (count < 2) {
        warnings.push(`Question ${current.number}: could not confidently detect its options -- left blank for you to fill in.`)
        for (const letter of ['A', 'B', 'C', 'D']) {
          if (!(letter in current.options)) current.options[letter] = ''
        }
      }
      current.needsDiagram = fragments.length >= MIN_FRAGMENTS_FOR_DIAGRAM || count < 2
      questions.push(current)
    }
    current = null
    fragments = []
  }

  const feedLine = (rawText, pageNum, y, isFirstLineOfPage) => {
    const text = rawText.trim()
    if (!text) return
    if (HEADER_FOOTER_LINE.test(text)) return
    if (isFirstLineOfPage && /^\d{1,3}$/.test(text)) return // lone page-number header
    if (current) current.lastLineY = y

    if (ANSWER_KEY_HEADER.test(text)) {
      answerKeyMode = true
      pushCurrent()
      return
    }
    if (answerKeyMode) {
      answerKeyLines.push(text)
      return
    }

    if (pendingLooseOption) {
      const expected = String.fromCharCode(pendingLooseOption.letter.charCodeAt(0) + 1)
      const m = text.match(OPTION_LINE_LOOSE)
      if (m && m[1].toUpperCase() === expected) {
        setOption(pendingLooseOption.letter, pendingLooseOption.text, pendingLooseOption.y, pageNum)
      } else if (current && Object.keys(current.options).length === 0) {
        current.text += ' ' + pendingLooseOption.raw
      }
      pendingLooseOption = null
    }

    const strictQ = text.match(QUESTION_START_STRICT)
    const looseQ = !strictQ ? text.match(QUESTION_START_LOOSE) : null
    const qMatch = strictQ || looseQ
    if (qMatch) {
      const num = Number(qMatch[1])
      const isNextExpected = num === expectedNextNumber()
      // A second "N ..." candidate with the SAME number as the still-open,
      // not-yet-confirmed current question means the first one was a false
      // start (e.g. a cover-page line like "1 hour") -- restart, don't merge.
      const isRetryOfOpenQuestion = current && num === current.number && Object.keys(current.options).length === 0
      if (isRetryOfOpenQuestion) {
        current = null
        fragments = []
      } else if (isNextExpected) {
        pushCurrent()
      }
      if (isNextExpected || isRetryOfOpenQuestion) {
        lastQuestionNumber = num
        current = {
          id: nextId(),
          number: num,
          text: qMatch[2].trim(),
          options: {},
          correctOption: null,
          imageUrl: null,
          pageNum,
          stemTopY: y,
          firstOptionY: undefined,
          lastLineY: y,
          diagramBlob: null,
        }
        return
      }
    }

    const crammed = text.match(CRAMMED_OPTIONS_LINE)
    if (crammed && current && Object.keys(current.options).length === 0) {
      setOption('A', crammed[1], y, pageNum)
      setOption('B', crammed[2], y, pageNum)
      if (crammed[3]) setOption('C', crammed[3], y, pageNum)
      if (crammed[4]) setOption('D', crammed[4], y, pageNum)
      return
    }

    const strictOpt = text.match(OPTION_LINE_STRICT)
    if (strictOpt && current) {
      const letter = strictOpt[1].toUpperCase()
      if (letter === nextOptionLetter()) {
        setOption(letter, strictOpt[2], y, pageNum)
        return
      }
    }

    const looseOpt = !strictOpt ? text.match(OPTION_LINE_LOOSE) : null
    if (looseOpt && current) {
      const letter = looseOpt[1].toUpperCase()
      const expectedLetter = nextOptionLetter()
      if (letter === expectedLetter && letter === 'A') {
        // "A" is genuinely ambiguous with the ordinary word "a sentence
        // starting like this" -- only accept once the next line confirms "B".
        pendingLooseOption = { letter: 'A', text: looseOpt[2], raw: text, y }
        return
      }
      if (letter === expectedLetter && letter !== 'A') {
        // B/C/D immediately after a confirmed A are unambiguous.
        setOption(letter, looseOpt[2], y, pageNum)
        return
      }
    }

    const inlineAns = text.match(INLINE_ANSWER)
    if (inlineAns && current) {
      current.correctOption = inlineAns[1].toUpperCase()
      return
    }

    if (current) {
      if (Object.keys(current.options).length === 0) {
        current.text += ' ' + text
        if (text.length <= FRAGMENT_LINE_MAX_CHARS) fragments.push(text)
      } else if (text.length <= 6 && current.lastOptionLetter && current.lastOptionPage === pageNum) {
        // A stray short fragment right after options started, same page --
        // likely a superscript exponent (the "2" in "m/s2") on its own line.
        current.options[current.lastOptionLetter] += text
      }
    }
  }

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      onProgress?.({ stage: 'reading', page: pageNum, totalPages: pdf.numPages })
      const page = await pdf.getPage(pageNum)
      let lines = await getPageLines(page)
      const layerChars = lines.reduce((sum, l) => sum + l.text.trim().length, 0)

      let pageRender = null
      const getPageRenderLazy = async () => {
        if (!pageRender) pageRender = await renderPageCanvas(page)
        return pageRender
      }

      if (layerChars < MIN_CHARS_FOR_TEXT_LAYER) {
        if (!ocrWorker) {
          onProgress?.({ stage: 'ocr-init' })
          ocrWorker = await createWorker('eng')
        }
        usedOcr = true
        onProgress?.({ stage: 'ocr', page: pageNum, totalPages: pdf.numPages })
        const { canvas } = await getPageRenderLazy()
        const { data } = await ocrWorker.recognize(canvas)
        lines = data.text.split('\n').map((t) => ({ text: t, y: null }))
      }

      lines.forEach((line, i) => feedLine(line.text, pageNum, line.y, i === 0))

      // Crop a diagram snapshot for whichever question is still open at the
      // end of this page, if it looks like it needs one and we have real
      // (non-OCR) page coordinates to crop with.
      if (current && current.needsDiagramCheck !== false && current.pageNum === pageNum && current.stemTopY != null) {
        const wantsDiagram = fragments.length >= MIN_FRAGMENTS_FOR_DIAGRAM
        if (wantsDiagram) {
          const bottom = current.firstOptionY ?? current.lastLineY ?? current.stemTopY
          const { canvas, viewport } = await getPageRenderLazy()
          current.diagramBlob = await cropCanvasToBlob(canvas, viewport, current.stemTopY, bottom)
        }
      }
    }
    pushCurrent()

    // A question whose options all came back blank almost certainly needs
    // a visual aid too (a table/graph with no distinguishing option text),
    // even if the fragment-count heuristic above didn't catch it -- crop
    // its whole block as a last-resort snapshot.
    for (const q of questions) {
      const allBlank = Object.values(q.options).every((v) => !v)
      if (allBlank && !q.diagramBlob && q.stemTopY != null && q.pageNum) {
        try {
          const page = await pdf.getPage(q.pageNum)
          const { canvas, viewport } = await renderPageCanvas(page)
          const bottom = q.firstOptionY ?? q.lastLineY ?? q.stemTopY
          q.diagramBlob = await cropCanvasToBlob(canvas, viewport, q.stemTopY, bottom, 14)
        } catch {
          // Best-effort only -- leave diagramBlob null if this fails.
        }
      }
    }
  } finally {
    if (ocrWorker) await ocrWorker.terminate()
  }

  if (answerKeyLines.length > 0) {
    const joined = answerKeyLines.join(', ')
    let match
    let appliedAny = false
    ANSWER_LIST_PAIR.lastIndex = 0
    while ((match = ANSWER_LIST_PAIR.exec(joined)) !== null) {
      const target = questions.find((q) => q.number === Number(match[1]))
      if (target) {
        target.correctOption = match[2].toUpperCase()
        appliedAny = true
      }
    }
    if (!appliedAny) {
      warnings.push('An answer key section was found but could not be matched to question numbers. Please set correct answers manually.')
    }
  }

  const missingAnswers = questions.filter((q) => !q.correctOption).length
  if (missingAnswers > 0) {
    warnings.push(`${missingAnswers} question(s) have no detected answer -- please select the correct option manually.`)
  }

  const diagramCount = questions.filter((q) => q.diagramBlob).length
  if (diagramCount > 0) {
    warnings.push(`${diagramCount} question(s) appear to include a diagram, graph, or table -- a snapshot was auto-attached. Please check each one looks right (remove it if it isn't useful).`)
  }

  if (questions.length === 0) {
    warnings.push('No questions could be detected in this PDF.')
  }

  // `number` is kept (as `sourceNumber`) rather than stripped, so a
  // separately-uploaded marking scheme can later match answers back to the
  // right question even if some were edited/reordered/deleted in review.
  const normalized = questions.map(
    ({ number, pageNum: _pageNum, stemTopY: _stemTopY, firstOptionY: _firstOptionY, lastLineY: _lastLineY, lastOptionLetter: _lastOptionLetter, lastOptionPage: _lastOptionPage, needsDiagram: _needsDiagram, ...q }) => ({
      ...q,
      sourceNumber: number,
    })
  )

  return { questions: normalized, warnings, usedOcr }
}
