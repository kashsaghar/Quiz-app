import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, Upload, FileText, ClipboardList } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { uploadStudentAnswerSheet, triggerGrading } from '../../utils/theoryStorage'
import Spinner from '../../components/Spinner'
import SubmittedScreen from './SubmittedScreen'

export default function TheoryExamPage() {
  const { examId } = useParams()

  const [phase, setPhase] = useState('loading') // loading | not_found | register | submitting | submitted
  const [exam, setExam] = useState(null)

  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [answerFile, setAnswerFile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      const { data, error: examError } = await supabase
        .from('theory_exams')
        .select('id, title, total_marks, exam_paper_url')
        .eq('id', examId)
        .single()

      if (examError || !data || !data.exam_paper_url) {
        if (active) setPhase('not_found')
        return
      }

      if (active) {
        setExam(data)
        setPhase('register')
      }
    }

    load()
    return () => {
      active = false
    }
  }, [examId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!answerFile) {
      setError('Please upload your worked answer sheet as a PDF.')
      return
    }

    setPhase('submitting')
    try {
      const { data, error: rpcError } = await supabase.rpc('create_theory_submission', {
        p_exam_id: examId,
        p_student_name: name.trim(),
        p_roll_number: rollNumber.trim() || null,
      })
      if (rpcError) throw rpcError
      const submissionId = data[0].submission_id

      await uploadStudentAnswerSheet(examId, submissionId, answerFile)
      triggerGrading(submissionId) // fire-and-forget; teacher can retry from the results page

      setPhase('submitted')
    } catch (err) {
      setError('Could not submit your answer sheet: ' + err.message + '. Please try again.')
      setPhase('register')
    }
  }

  if (phase === 'loading') return <Spinner label="Loading exam…" />

  if (phase === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-600">This exam link is invalid or no longer exists.</p>
      </div>
    )
  }

  if (phase === 'submitted') {
    return <SubmittedScreen studentName={name} quizTitle={exam.title} />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <ClipboardList className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{exam.title}</h1>
        <p className="mt-1 text-sm text-slate-500">Total marks: {exam.total_marks}</p>

        <a
          href={exam.exam_paper_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
        >
          <Download className="h-4 w-4" /> Download Exam Paper
        </a>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Roll Number (optional)</label>
            <input
              type="text"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. 2024-CS-101"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Your Worked Answer Sheet (PDF) *</label>
            <p className="mb-1.5 text-xs text-slate-400">
              Write your answers, then photograph/scan every page and convert them to a single PDF before uploading.
            </p>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30">
              <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              <span className="flex-1 truncate">{answerFile ? answerFile.name : 'Click to choose a PDF file'}</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setAnswerFile(e.target.files[0])}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={phase === 'submitting'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" /> {phase === 'submitting' ? 'Submitting…' : 'Submit My Answer Sheet'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Your teacher will check your result — marks aren't shown here.
          </p>
        </form>
      </div>
    </div>
  )
}
