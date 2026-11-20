// Parses raw question-bank text into structured quiz questions.
//
// Supports question numbering like "1." "1)" "Q1." and option markers like
// "A)" "A." "a)" "(A)". Also detects a trailing answer-key section such as:
//   Answers: 1-A, 2-C, 3-B
//   Answer Key
//   1. B
//   2) A
// or an inline "Answer: B" / "Ans: B" directly below a question's options.
//
// Returns: { questions: Question[], warnings: string[] }
// Question: { id, text, options: {A,B,C,...}, correctOption: 'A'|null }

let idCounter = 0
function nextId() {
  idCounter += 1
  return `tmp-${Date.now()}-${idCounter}`
}

// Exported so the PDF-aware extractor (pdfQuizExtractor.js) can classify
// page-by-page lines with the exact same rules used here for pasted text.
export const QUESTION_START = /^\s*(?:q\.?\s*)?(\d{1,3})\s*[.)-]\s+(.*)$/i
export const OPTION_LINE = /^\s*\(?([a-dA-D])\)?\s*[.):-]\s+(.*)$/
export const ANSWER_KEY_HEADER = /^\s*answer(?:s)?\s*(?:key)?\s*:?\s*$/i
export const INLINE_ANSWER = /^\s*(?:ans(?:wer)?)\s*[:.-]\s*\(?([a-dA-D])\)?\s*$/i
export const ANSWER_LIST_PAIR = /(\d{1,3})\s*[-:.]\s*\(?([a-dA-D])\)?/gi

export function parseQuizText(rawText) {
  const warnings = []
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === '')) // collapse blank runs

  const questions = []
  let current = null
  let answerKeyMode = false
  const answerKeyLines = []

  const pushCurrent = () => {
    if (current && Object.keys(current.options).length >= 2) {
      questions.push(current)
    } else if (current) {
      warnings.push(`Question "${current.text.slice(0, 40)}..." was dropped (fewer than 2 options found).`)
    }
    current = null
  }

  for (const line of lines) {
    if (line === '') continue

    if (ANSWER_KEY_HEADER.test(line)) {
      answerKeyMode = true
      pushCurrent()
      continue
    }

    if (answerKeyMode) {
      answerKeyLines.push(line)
      continue
    }

    const qMatch = line.match(QUESTION_START)
    if (qMatch) {
      pushCurrent()
      current = {
        id: nextId(),
        number: Number(qMatch[1]),
        text: qMatch[2].trim(),
        options: {},
        correctOption: null,
        imageUrl: null,
      }
      continue
    }

    const optMatch = line.match(OPTION_LINE)
    if (optMatch && current) {
      const letter = optMatch[1].toUpperCase()
      current.options[letter] = optMatch[2].trim()
      continue
    }

    const inlineAns = line.match(INLINE_ANSWER)
    if (inlineAns && current) {
      current.correctOption = inlineAns[1].toUpperCase()
      continue
    }

    // Continuation of the question text (wrapped line) or stray text.
    if (current) {
      if (Object.keys(current.options).length === 0) {
        current.text += ' ' + line
      }
      // otherwise ignore stray text after options started
    }
  }
  pushCurrent()

  // Parse a trailing "Answers: 1-A, 2-C, 3-B" style block, or a numbered
  // "1. B / 2) A" list under an "Answer Key" header.
  if (answerKeyLines.length > 0) {
    const joined = answerKeyLines.join(', ')
    let match
    let appliedAny = false
    ANSWER_LIST_PAIR.lastIndex = 0
    while ((match = ANSWER_LIST_PAIR.exec(joined)) !== null) {
      const qNum = Number(match[1])
      const letter = match[2].toUpperCase()
      const target = questions.find((q) => q.number === qNum)
      if (target) {
        target.correctOption = letter
        appliedAny = true
      }
    }
    if (!appliedAny) {
      warnings.push('An answer key section was found but could not be matched to question numbers. Please set correct answers manually.')
    }
  }

  const missingAnswers = questions.filter((q) => !q.correctOption).length
  if (missingAnswers > 0) {
    warnings.push(`${missingAnswers} question(s) have no detected answer — please select the correct option manually.`)
  }

  // `number` is kept (as `sourceNumber`) rather than stripped, so a
  // separately-uploaded marking scheme can later match answers back to the
  // right question even if some were edited/reordered/deleted in review.
  const normalized = questions.map(({ number, ...q }) => ({ ...q, sourceNumber: number }))

  if (normalized.length === 0) {
    warnings.push('No questions could be detected. Make sure questions are numbered (e.g. "1.") and options are labeled (e.g. "A)").')
  }

  return { questions: normalized, warnings }
}

export function makeBlankQuestion() {
  return {
    id: nextId(),
    text: '',
    options: { A: '', B: '', C: '', D: '' },
    correctOption: null,
    imageUrl: null,
    sourceNumber: null,
  }
}
