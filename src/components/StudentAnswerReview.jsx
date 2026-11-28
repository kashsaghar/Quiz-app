import { X, Check, XCircle, MinusCircle } from 'lucide-react'

export default function StudentAnswerReview({ submission, questions, onClose }) {
  if (!submission) return null

  const studentAnswers = submission.answers || {}

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
              Scored {submission.score} / {submission.total_questions}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {questions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No questions found for this quiz.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((q, i) => {
                const studentOption = studentAnswers[q.id] ?? null
                const isCorrect = studentOption && q.correctOption && studentOption === q.correctOption
                const isBlank = !studentOption

                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 ${
                      isBlank ? 'border-slate-200 bg-slate-50' : isCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {i + 1}
                      </span>
                      <p className="flex-1 text-sm font-medium text-slate-900">{q.question_text}</p>
                      {isBlank ? (
                        <MinusCircle className="h-5 w-5 shrink-0 text-slate-400" />
                      ) : isCorrect ? (
                        <Check className="h-5 w-5 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                      )}
                    </div>

                    {q.image_url && (
                      <img src={q.image_url} alt="Question diagram" className="ml-7 mt-2 max-h-48 max-w-full rounded border border-slate-200" />
                    )}

                    <div className="ml-7 mt-2 space-y-1 text-sm">
                      {Object.entries(q.options || {}).map(([letter, text]) => {
                        const isStudentChoice = letter === studentOption
                        const isCorrectChoice = letter === q.correctOption
                        return (
                          <div
                            key={letter}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                              isCorrectChoice
                                ? 'bg-emerald-100 text-emerald-900'
                                : isStudentChoice
                                ? 'bg-red-100 text-red-900'
                                : 'text-slate-600'
                            }`}
                          >
                            <span className="font-semibold">{letter}.</span>
                            <span className="flex-1">{text}</span>
                            {isCorrectChoice && <span className="text-xs font-medium">Correct answer</span>}
                            {isStudentChoice && !isCorrectChoice && <span className="text-xs font-medium">Student's answer</span>}
                          </div>
                        )
                      })}
                    </div>

                    {isBlank && <p className="ml-7 mt-2 text-xs font-medium text-slate-500">Not answered</p>}
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
