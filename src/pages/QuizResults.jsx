import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Search, ArrowUpDown } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { downloadSubmissionsCsv } from '../utils/csvExport'
import Spinner from '../components/Spinner'
import StudentAnswerReview from '../components/StudentAnswerReview'

export default function QuizResults() {
  const { quizId } = useParams()
  const navigate = useNavigate()

  const [quiz, setQuiz] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('submitted_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: quizRow, error: quizError } = await supabase
        .from('quizzes')
        .select('id, title, time_limit_minutes')
        .eq('id', quizId)
        .single()

      if (quizError || !quizRow) {
        if (active) {
          setNotFound(true)
          setLoading(false)
        }
        return
      }

      // RLS restricts this SELECT to the owning teacher only — another
      // teacher's token simply gets an empty result set here.
      const { data: subRows } = await supabase
        .from('submissions')
        .select('id, student_name, roll_number, answers, score, total_questions, submitted_at')
        .eq('quiz_id', quizId)

      // Needed to show each student's right/wrong breakdown. This only
      // reads existing questions/answers — nothing here is written or
      // changed, so current scores and submissions are untouched.
      const { data: questionRows } = await supabase
        .from('questions')
        .select('id, question_text, options, image_url, order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true })

      const questionIds = (questionRows ?? []).map((q) => q.id)
      const { data: answerRows } = questionIds.length
        ? await supabase.from('quiz_answers').select('question_id, correct_option').in('question_id', questionIds)
        : { data: [] }

      const correctByQuestionId = new Map((answerRows ?? []).map((a) => [a.question_id, a.correct_option]))

      if (active) {
        setQuiz(quizRow)
        setSubmissions(subRows ?? [])
        setQuestions(
          (questionRows ?? []).map((q) => ({
            ...q,
            correctOption: correctByQuestionId.get(q.id) ?? null,
          }))
        )
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [quizId])

  const stats = useMemo(() => {
    if (submissions.length === 0) return { total: 0, avg: 0, high: 0, low: 0 }
    const percentages = submissions.map((s) => (s.total_questions > 0 ? (s.score / s.total_questions) * 100 : 0))
    return {
      total: submissions.length,
      avg: Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10,
      high: Math.round(Math.max(...percentages) * 10) / 10,
      low: Math.round(Math.min(...percentages) * 10) / 10,
    }
  }, [submissions])

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = submissions
    if (q) {
      rows = rows.filter(
        (s) => s.student_name.toLowerCase().includes(q) || (s.roll_number || '').toLowerCase().includes(q)
      )
    }

    const withPct = rows.map((s) => ({
      ...s,
      percentage: s.total_questions > 0 ? (s.score / s.total_questions) * 100 : 0,
    }))

    withPct.sort((a, b) => {
      let diff = 0
      if (sortKey === 'student_name') diff = a.student_name.localeCompare(b.student_name)
      else if (sortKey === 'score') diff = a.score - b.score
      else if (sortKey === 'percentage') diff = a.percentage - b.percentage
      else diff = new Date(a.submitted_at) - new Date(b.submitted_at)
      return sortDir === 'asc' ? diff : -diff
    })

    return withPct
  }, [submissions, search, sortKey, sortDir])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (loading) return <Spinner label="Loading results…" />

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-slate-600">Quiz not found, or you don't have access to it.</p>
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-indigo-600">
          ← Back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/dashboard')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-semibold text-slate-900">{quiz.title}</h1>
            <p className="text-xs text-slate-500">{quiz.time_limit_minutes} minute time limit</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Students" value={stats.total} />
          <StatCard label="Average Score" value={`${stats.avg}%`} />
          <StatCard label="Highest Score" value={`${stats.high}%`} />
          <StatCard label="Lowest Score" value={`${stats.low}%`} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or roll number…"
                className="rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              onClick={() => downloadSubmissionsCsv(quiz.title, filteredSorted)}
              disabled={submissions.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>

          {submissions.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No submissions yet. Share the student link to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <Th label="Student Name" columnKey="student_name" activeKey={sortKey} onSort={toggleSort} />
                    <th className="px-3 py-2">Roll Number</th>
                    <Th label="Score" columnKey="score" activeKey={sortKey} onSort={toggleSort} />
                    <Th label="Percentage" columnKey="percentage" activeKey={sortKey} onSort={toggleSort} />
                    <Th label="Submitted At" columnKey="submitted_at" activeKey={sortKey} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSubmissionId(s.id)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-indigo-50/50"
                    >
                      <td className="px-3 py-2.5 font-medium text-indigo-700 underline-offset-2 hover:underline">{s.student_name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{s.roll_number || 'N/A'}</td>
                      <td className="px-3 py-2.5">{s.score} / {s.total_questions}</td>
                      <td className="px-3 py-2.5">{Math.round(s.percentage)}%</td>
                      <td className="px-3 py-2.5 text-slate-500">{new Date(s.submitted_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selectedSubmissionId && (
        <StudentAnswerReview
          submission={submissions.find((s) => s.id === selectedSubmissionId)}
          questions={questions}
          onClose={() => setSelectedSubmissionId(null)}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Th({ label, columnKey, activeKey, onSort }) {
  return (
    <th className="px-3 py-2">
      <button
        onClick={() => onSort(columnKey)}
        className={`flex items-center gap-1 hover:text-slate-700 ${activeKey === columnKey ? 'text-indigo-600' : ''}`}
      >
        {label} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  )
}
