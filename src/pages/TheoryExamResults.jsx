import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Search, ArrowUpDown } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Spinner from '../components/Spinner'
import TheoryResultReview from '../components/TheoryResultReview'

const STATUS_BADGE = {
  pending: 'bg-slate-100 text-slate-600',
  grading: 'bg-amber-100 text-amber-700',
  graded: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
}

export default function TheoryExamResults() {
  const { examId } = useParams()
  const navigate = useNavigate()

  const [exam, setExam] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('submitted_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedId, setSelectedId] = useState(null)
  const [regrading, setRegrading] = useState(false)

  const load = async () => {
    const { data: examRow, error: examError } = await supabase
      .from('theory_exams')
      .select('id, title, total_marks')
      .eq('id', examId)
      .single()

    if (examError || !examRow) {
      setNotFound(true)
      setLoading(false)
      return
    }

    const { data: subRows } = await supabase
      .from('theory_submissions')
      .select('id, student_name, roll_number, status, marks_awarded, grading_feedback, error_message, submitted_at, graded_at')
      .eq('exam_id', examId)

    setExam(examRow)
    setSubmissions(subRows ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

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
      total_marks: exam?.total_marks ?? 0,
      percentage: s.status === 'graded' && exam?.total_marks > 0 ? (s.marks_awarded / exam.total_marks) * 100 : null,
    }))

    withPct.sort((a, b) => {
      let diff = 0
      if (sortKey === 'student_name') diff = a.student_name.localeCompare(b.student_name)
      else if (sortKey === 'percentage') diff = (a.percentage ?? -1) - (b.percentage ?? -1)
      else if (sortKey === 'status') diff = a.status.localeCompare(b.status)
      else diff = new Date(a.submitted_at) - new Date(b.submitted_at)
      return sortDir === 'asc' ? diff : -diff
    })

    return withPct
  }, [submissions, search, sortKey, sortDir, exam])

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleRegrade = async (submissionId) => {
    setRegrading(true)
    try {
      await fetch('/api/grade-theory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })
    } finally {
      await load()
      setRegrading(false)
    }
  }

  if (loading) return <Spinner label="Loading results…" />

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
        <p className="text-slate-600">Exam not found, or you don't have access to it.</p>
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold text-indigo-600">
          ← Back to dashboard
        </button>
      </div>
    )
  }

  const selected = submissions.find((s) => s.id === selectedId)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/dashboard')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-semibold text-slate-900">{exam.title}</h1>
            <p className="text-xs text-slate-500">Theory exam · {exam.total_marks} marks</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
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
                    <Th label="Status" columnKey="status" activeKey={sortKey} onSort={toggleSort} />
                    <Th label="Percentage" columnKey="percentage" activeKey={sortKey} onSort={toggleSort} />
                    <Th label="Submitted At" columnKey="submitted_at" activeKey={sortKey} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-indigo-50/50"
                    >
                      <td className="px-3 py-2.5 font-medium text-indigo-700 underline-offset-2 hover:underline">{s.student_name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{s.roll_number || 'N/A'}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] || ''}`}>
                          {s.status === 'graded' ? `${s.marks_awarded} / ${exam.total_marks}` : s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{s.percentage != null ? `${Math.round(s.percentage)}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{new Date(s.submitted_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {selected && (
        <TheoryResultReview
          submission={{ ...selected, total_marks: exam.total_marks }}
          onClose={() => setSelectedId(null)}
          onRegrade={handleRegrade}
          regrading={regrading}
        />
      )}
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
