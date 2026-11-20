import { useState } from 'react'
import { ClipboardList, Clock, ListChecks } from 'lucide-react'

export default function RegistrationGate({ quiz, questionCount, onStart }) {
  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }
    onStart({ studentName: name.trim(), rollNumber: rollNumber.trim() })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
          <ClipboardList className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">{quiz.title}</h1>

        <div className="mt-3 flex gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <ListChecks className="h-4 w-4" /> {questionCount} question{questionCount === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {quiz.time_limit_minutes} minutes
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              autoFocus
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start Test
          </button>
          <p className="text-center text-xs text-slate-400">
            Once started, the {quiz.time_limit_minutes}-minute timer cannot be paused.
          </p>
        </form>
      </div>
    </div>
  )
}
