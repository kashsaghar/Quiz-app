import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Timer from '../../components/Timer'

export default function ActiveTest({ quiz, questions, answers, onAnswer, endTime, onExpire, submitting, onSubmit }) {
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.round((endTime - Date.now()) / 1000)))
  const answeredCount = Object.keys(answers).length

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">{quiz.title}</h1>
            <p className="text-xs text-slate-500">
              {answeredCount} / {questions.length} answered
            </p>
          </div>
          <Timer endTime={endTime} onExpire={onExpire} secondsLeft={secondsLeft} setSecondsLeft={setSecondsLeft} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {questions.map((q, index) => (
          <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-slate-900">
              {index + 1}. {q.question_text}
            </p>
            {q.image_url && (
              <img
                src={q.image_url}
                alt={`Diagram for question ${index + 1}`}
                className="mb-3 max-h-80 max-w-full rounded-lg border border-slate-200"
              />
            )}
            <div className="space-y-2">
              {Object.entries(q.options).map(([letter, text]) => (
                <label
                  key={letter}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                    answers[q.id] === letter
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === letter}
                    onChange={() => onAnswer(q.id, letter)}
                    className="mt-0.5 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    <span className="font-medium">{letter}.</span> {text}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <p className="text-xs text-slate-500">You can change answers until time runs out.</p>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Test
          </button>
        </div>
      </div>
    </div>
  )
}
