import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, FileText, Loader2, ArrowLeft, Plus, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseQuizText, makeBlankQuestion } from '../utils/quizParser'
import { extractQuizFromPdf } from '../utils/pdfQuizExtractor'
import QuestionEditor from '../components/QuestionEditor'

export default function CreateQuiz() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('input') // 'input' | 'review'
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsingStatus, setParsingStatus] = useState('')
  const [warnings, setWarnings] = useState([])
  const [parseError, setParseError] = useState('')

  const [title, setTitle] = useState('')
  const [timeLimit, setTimeLimit] = useState(30)
  const [questions, setQuestions] = useState([])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const applyExtracted = (parsed, parserWarnings, extraWarnings = []) => {
    setQuestions(parsed)
    setWarnings([...extraWarnings, ...parserWarnings])
    setStep('review')
  }

  const handleFile = async (file) => {
    setParseError('')
    setParsing(true)
    setParsingStatus('Reading file…')
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const result = await extractQuizFromPdf(file, {
          onProgress: ({ stage, page, totalPages }) => {
            if (stage === 'reading') setParsingStatus(`Reading page ${page} of ${totalPages}…`)
            else if (stage === 'ocr-init') setParsingStatus('This PDF looks scanned — loading OCR engine…')
            else if (stage === 'ocr') setParsingStatus(`Running OCR on page ${page} of ${totalPages}… (this can take a while)`)
          },
        })
        const extraWarnings = result.usedOcr
          ? [
              'This file contains scanned/image-only pages — OCR was used to read them, which is less accurate than a real text layer. Please double-check every question, option, and answer carefully.',
            ]
          : []
        applyExtracted(result.questions, result.warnings, extraWarnings)
      } else {
        const text = await file.text()
        setRawText(text)
        const { questions: parsed, warnings: w } = parseQuizText(text)
        applyExtracted(parsed, w)
      }
    } catch (err) {
      setParseError('Could not read that file: ' + err.message)
    } finally {
      setParsing(false)
      setParsingStatus('')
    }
  }

  const handlePasteContinue = () => {
    if (!rawText.trim()) {
      setParseError('Paste some question text first.')
      return
    }
    setParseError('')
    const { questions: parsed, warnings: w } = parseQuizText(rawText)
    applyExtracted(parsed, w)
  }

  const updateQuestion = (index, updated) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
  }

  const deleteQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const addQuestion = () => {
    setQuestions((prev) => [...prev, makeBlankQuestion()])
  }

  const canSave =
    title.trim().length > 0 &&
    timeLimit > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.text.trim() &&
        Object.keys(q.options).length >= 2 &&
        Object.values(q.options).every((opt) => opt.trim().length > 0) &&
        q.correctOption
    )

  const handleSave = async () => {
    setSaveError('')
    setSaving(true)

    try {
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({ teacher_id: user.id, title: title.trim(), time_limit_minutes: Number(timeLimit) })
        .select()
        .single()
      if (quizError) throw quizError

      const questionRows = questions.map((q, index) => ({
        quiz_id: quiz.id,
        question_text: q.text.trim(),
        options: q.options,
        order_index: index,
      }))

      const { data: insertedQuestions, error: questionsError } = await supabase
        .from('questions')
        .insert(questionRows)
        .select()
      if (questionsError) throw questionsError

      // insertedQuestions preserves insertion order for a fresh insert, but
      // match by order_index to be safe rather than assuming array order.
      const byOrder = new Map(insertedQuestions.map((row) => [row.order_index, row]))
      const answerRows = questions.map((q, index) => ({
        question_id: byOrder.get(index).id,
        correct_option: q.correctOption,
      }))

      const { error: answersError } = await supabase.from('quiz_answers').insert(answerRows)
      if (answersError) throw answersError

      // Diagram images auto-cropped from an uploaded PDF exist only as
      // in-memory Blobs until now -- upload each one to storage and point
      // the question row at the resulting public URL.
      const uploads = questions
        .map((q, index) => ({ blob: q.diagramBlob, row: byOrder.get(index) }))
        .filter((u) => u.blob)
        .map(async ({ blob, row }) => {
          const path = `${quiz.id}/${row.id}.png`
          const { error: uploadError } = await supabase.storage
            .from('quiz-diagrams')
            .upload(path, blob, { contentType: 'image/png' })
          if (uploadError) throw uploadError

          const { data: publicUrlData } = supabase.storage.from('quiz-diagrams').getPublicUrl(path)
          const { error: updateError } = await supabase
            .from('questions')
            .update({ image_url: publicUrlData.publicUrl })
            .eq('id', row.id)
          if (updateError) throw updateError
        })

      await Promise.all(uploads)

      navigate('/dashboard')
    } catch (err) {
      setSaveError(err.message || 'Something went wrong while saving.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/dashboard')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-slate-900">Create Quiz</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {step === 'input' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <Upload className="h-4 w-4" /> Upload a file
              </h2>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-10 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30">
                <FileText className="mb-2 h-6 w-6 text-slate-400" />
                {parsing ? parsingStatus || 'Reading file…' : 'Click to choose a .pdf or .txt file'}
                <input
                  type="file"
                  accept=".pdf,.txt,text/plain,application/pdf"
                  className="hidden"
                  disabled={parsing}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </label>
            </div>

            <div className="flex items-center gap-3 text-xs font-medium uppercase text-slate-400">
              <div className="h-px flex-1 bg-slate-200" /> or paste text <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={10}
                placeholder={`1. What is the capital of France?\nA) Paris\nB) Rome\nC) Berlin\nD) Madrid\n\nAnswers: 1-A`}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              {parseError && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
                  <AlertTriangle className="h-4 w-4" /> {parseError}
                </p>
              )}
              <button
                onClick={handlePasteContinue}
                disabled={parsing}
                className="mt-4 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Parse &amp; Continue
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Quiz Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Chapter 4 — Cell Biology"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Time Limit (minutes)</label>
                  <input
                    type="number"
                    min={1}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="mb-1 flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" /> Review needed
                </p>
                <ul className="list-inside list-disc space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-4">
              {questions.map((q, index) => (
                <QuestionEditor
                  key={q.id}
                  question={q}
                  index={index}
                  onChange={(updated) => updateQuestion(index, updated)}
                  onDelete={() => deleteQuestion(index)}
                />
              ))}
            </div>

            <button
              onClick={addQuestion}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            >
              <Plus className="h-4 w-4" /> Add question manually
            </button>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            <div className="flex items-center justify-between border-t border-slate-200 pt-6">
              <button onClick={() => setStep('input')} className="text-sm font-medium text-slate-500 hover:text-slate-700">
                ← Back to upload
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Quiz
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
