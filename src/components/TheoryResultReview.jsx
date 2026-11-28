import { X, RefreshCw } from 'lucide-react'

const STATUS_LABEL = {
  pending: 'Awaiting grading',
  grading: 'Grading…',
  graded: 'Graded',
  error: 'Grading failed',
}

export default function TheoryResultReview({ submission, onClose, onRegrade, regrading }) {
  if (!submission) return null

  const feedback = submission.grading_feedback

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">{submission.student_name}</h2>
            <p className="text-xs text-slate-500">
              {submission.roll_number ? `Roll ${submission.roll_number} · ` : ''}
              {STATUS_LABEL[submission.status] || submission.status}
              {submission.status === 'graded' && ` · Scored ${submission.marks_awarded} / ${submission.total_marks}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRegrade(submission.id)}
              disabled={regrading || submission.status === 'grading'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${regrading ? 'animate-spin' : ''}`} />
              {submission.status === 'graded' ? 'Regrade' : 'Grade now'}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {submission.status === 'error' && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {submission.error_message || 'Something went wrong while grading this submission.'}
            </p>
          )}

          {(submission.status === 'pending' || submission.status === 'grading') && !feedback && (
            <p className="py-8 text-center text-sm text-slate-500">
              {submission.status === 'grading'
                ? 'Gemini is grading this answer sheet now — check back shortly.'
                : "This submission hasn't been graded yet. Click \"Grade now\" above."}
            </p>
          )}

          {feedback && (
            <div className="space-y-4">
              {feedback.overallFeedback && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {feedback.overallFeedback}
                </p>
              )}

              {(feedback.questions || []).map((q, i) => {
                const isFull = q.marksAwarded >= q.marksPossible
                const isZero = q.marksAwarded <= 0
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 ${
                      isZero ? 'border-red-200 bg-red-50' : isFull ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">Question {q.questionNumber}</p>
                      <p className="shrink-0 text-sm font-semibold text-slate-700">
                        {q.marksAwarded} / {q.marksPossible}
                      </p>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{q.feedback}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
