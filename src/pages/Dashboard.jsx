import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Copy, Check, BarChart3, LogOut, GraduationCap, Clock, Users, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: quizRows, error } = await supabase
        .from('quizzes')
        .select('id, title, time_limit_minutes, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false })

      if (error || !active) {
        setLoading(false)
        return
      }

      const { data: subRows } = await supabase
        .from('submissions')
        .select('quiz_id')
        .in('quiz_id', quizRows.map((q) => q.id).length ? quizRows.map((q) => q.id) : ['00000000-0000-0000-0000-000000000000'])

      const counts = {}
      for (const row of subRows ?? []) {
        counts[row.quiz_id] = (counts[row.quiz_id] || 0) + 1
      }

      if (active) {
        setQuizzes(quizRows.map((q) => ({ ...q, submissionCount: counts[q.id] || 0 })))
        setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user.id])

  const copyLink = (quizId) => {
    const url = `${window.location.origin}/quiz/${quizId}`
    navigator.clipboard.writeText(url)
    setCopiedId(quizId)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-semibold text-slate-900">Quiz Dashboard</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Your Quizzes</h1>
          <Link
            to="/create"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> New Quiz
          </Link>
        </div>

        {loading ? (
          <Spinner label="Loading your quizzes…" />
        ) : quizzes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-slate-500">You haven't created any quizzes yet.</p>
            <Link to="/create" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-800">
              Create your first quiz →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-slate-900">{quiz.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {quiz.time_limit_minutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {quiz.submissionCount} submission{quiz.submissionCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => copyLink(quiz.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    {copiedId === quiz.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy Student Link
                      </>
                    )}
                  </button>
                  <Link
                    to={`/results/${quiz.id}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Results
                  </Link>
                </div>
                <Link
                  to={`/quiz/${quiz.id}/edit`}
                  className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Quiz
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
