import { CheckCircle2 } from 'lucide-react'

export default function SubmittedScreen({ studentName, quizTitle }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Thanks, {studentName}!</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your responses for <span className="font-medium text-slate-700">{quizTitle}</span> have been recorded
          successfully.
        </p>
        <p className="mt-4 text-xs text-slate-400">You may now close this window.</p>
      </div>
    </div>
  )
}
