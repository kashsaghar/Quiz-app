import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Loader2, Plus } from 'lucide-react'
import QuestionEditor from './QuestionEditor'

// Shared title/time-limit fields, marking-scheme upload, warnings, question
// list, and save/cancel footer -- used by both CreateQuiz (right after
// parsing a new file) and EditQuiz (editing an already-saved quiz).
export default function QuizEditorForm({
  title,
  onTitleChange,
  timeLimit,
  onTimeLimitChange,
  questions,
  onQuestionChange,
  onQuestionDelete,
  onAddQuestion,
  warnings,
  msParsing,
  msResult,
  onMarkSchemeFile,
  onCancel,
  cancelLabel,
  onSave,
  saving,
  saveError,
  canSave,
  saveLabel,
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Quiz Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
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
              onChange={(e) => onTimeLimitChange(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <ClipboardCheck className="h-4 w-4" /> Apply Marking Scheme (optional)
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Have a separate answer key / marking scheme for this question paper? Upload it to auto-fill correct answers
          below, matched by question number.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-4 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30">
          <FileText className="h-4 w-4 text-slate-400" />
          {msParsing ? 'Reading marking scheme…' : 'Click to choose a .pdf or .txt marking scheme'}
          <input
            type="file"
            accept=".pdf,.txt,text/plain,application/pdf"
            className="hidden"
            disabled={msParsing}
            onChange={(e) => {
              if (e.target.files?.[0]) onMarkSchemeFile(e.target.files[0])
              e.target.value = ''
            }}
          />
        </label>
        {msResult && (
          <p className={`mt-2 flex items-start gap-1.5 text-sm ${msResult.type === 'success' ? 'text-emerald-700' : 'text-amber-700'}`}>
            {msResult.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {msResult.text}
          </p>
        )}
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
            onChange={(updated) => onQuestionChange(index, updated)}
            onDelete={() => onQuestionDelete(index)}
          />
        ))}
      </div>

      <button
        onClick={onAddQuestion}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
      >
        <Plus className="h-4 w-4" /> Add question manually
      </button>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="flex items-center justify-between border-t border-slate-200 pt-6">
        <button onClick={onCancel} className="text-sm font-medium text-slate-500 hover:text-slate-700">
          {cancelLabel}
        </button>
        <button
          onClick={onSave}
          disabled={!canSave || saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
