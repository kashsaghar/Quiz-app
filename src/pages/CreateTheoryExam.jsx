import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { uploadTheoryExamFiles } from '../utils/theoryStorage'

export default function CreateTheoryExam() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [totalMarks, setTotalMarks] = useState(100)
  const [examPaperFile, setExamPaperFile] = useState(null)
  const [markingSchemeFile, setMarkingSchemeFile] = useState(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const canSave = title.trim().length > 0 && Number(totalMarks) > 0 && examPaperFile && markingSchemeFile

  const handleSave = async () => {
    setSaveError('')
    setSaving(true)
    try {
      const { data: exam, error: examError } = await supabase
        .from('theory_exams')
        .insert({ teacher_id: user.id, title: title.trim(), total_marks: Number(totalMarks) })
        .select()
        .single()
      if (examError) throw examError

      await uploadTheoryExamFiles(exam.id, examPaperFile, markingSchemeFile)

      navigate('/dashboard')
    } catch (err) {
      setSaveError(err.message || 'Something went wrong while saving.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/dashboard')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-slate-900">Create Theory Exam</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Exam Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Physics Mid-Term"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Total Marks *</label>
            <input
              type="number"
              min={1}
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Exam Paper (PDF) *</label>
            <p className="mb-1.5 text-xs text-slate-400">Students will download this to attempt the exam.</p>
            <FilePicker file={examPaperFile} onPick={setExamPaperFile} icon={FileText} />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Marking Scheme (PDF) *</label>
            <p className="mb-1.5 text-xs text-slate-400">
              Kept private — only you can see this. It's used to AI-grade each student's worked answers.
            </p>
            <FilePicker file={markingSchemeFile} onPick={setMarkingSchemeFile} icon={ClipboardCheck} />
          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex gap-3 border-t border-slate-100 pt-5">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Create Theory Exam'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

function FilePicker({ file, onPick, icon: Icon }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/30">
      <Icon className="h-5 w-5 shrink-0 text-slate-400" />
      <span className="flex-1 truncate">{file ? file.name : 'Click to choose a PDF file'}</span>
      <input
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
    </label>
  )
}
