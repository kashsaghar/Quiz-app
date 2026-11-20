import { useState } from 'react'
import { extractAnswerKeyFromFile } from '../utils/markSchemeParser'

// Shared by CreateQuiz and EditQuiz: parses an uploaded marking scheme and
// applies its answers to whichever questions carry a matching sourceNumber.
export function useMarkSchemeUpload(questions, setQuestions) {
  const [msParsing, setMsParsing] = useState(false)
  const [msResult, setMsResult] = useState(null) // { type: 'success' | 'error', text }

  const handleMarkSchemeFile = async (file) => {
    setMsParsing(true)
    setMsResult(null)
    try {
      const { answers, warnings: msWarnings } = await extractAnswerKeyFromFile(file)

      const numbered = questions.filter((q) => q.sourceNumber != null)
      const applied = numbered.filter((q) => q.sourceNumber in answers).length
      const unmatched = numbered.length - applied

      setQuestions((prev) =>
        prev.map((q) => (q.sourceNumber != null && q.sourceNumber in answers ? { ...q, correctOption: answers[q.sourceNumber] } : q))
      )

      const parts = []
      if (applied > 0) parts.push(`Applied ${applied} answer${applied === 1 ? '' : 's'}.`)
      if (unmatched > 0) parts.push(`${unmatched} question${unmatched === 1 ? '' : 's'} had no matching answer in this file.`)
      if (applied === 0) parts.push('No answers could be matched to your questions.')

      setMsResult({
        type: applied > 0 ? 'success' : 'error',
        text: [...parts, ...msWarnings].join(' '),
      })
    } catch (err) {
      setMsResult({ type: 'error', text: 'Could not read that file: ' + err.message })
    } finally {
      setMsParsing(false)
    }
  }

  return { msParsing, msResult, handleMarkSchemeFile }
}
