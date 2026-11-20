import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { makeBlankQuestion } from '../utils/quizParser'
import { useMarkSchemeUpload } from '../hooks/useMarkSchemeUpload'
import QuizEditorForm from '../components/QuizEditorForm'
import Spinner from '../components/Spinner'

export default function EditQuiz() {
  const { quizId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [title, setTitle] = useState('')
  const [timeLimit, setTimeLimit] = useState(30)
  const [questions, setQuestions] = useState([])
  const [warnings] = useState([])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const { msParsing, msResult, handleMarkSchemeFile } = useMarkSchemeUpload(questions, setQuestions)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .select('id, title, time_limit_minutes, teacher_id')
        .eq('id', quizId)
        .single()

      if (quizError || !quiz || quiz.teacher_id !== user.id) {
        if (active) {
          setNotFound(true)
          setLoading(false)
        }
        return
      }

      const { data: questionRows, error: questionsError } = await supabase
        .from('questions')
        .select('id, question_text, options, image_url, order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true })

      if (questionsError || !active) return

      const { data: answerRows } = await supabase
        .from('quiz_answers')
        .select('question_id, correct_option')
        .in('question_id', questionRows.map((q) => q.id).length ? questionRows.map((q) => q.id) : ['00000000-0000-0000-0000-000000000000'])

      const answerByQuestionId = new Map((answerRows ?? []).map((a) => [a.question_id, a.correct_option]))

      if (!active) return
      setTitle(quiz.title)
      setTimeLimit(quiz.time_limit_minutes)
      setQuestions(
        questionRows.map((q) => ({
          id: q.id,
          text: q.question_text,
          options: q.options,
          correctOption: answerByQuestionId.get(q.id) ?? null,
          imageUrl: q.image_url,
          diagramBlob: null,
          // The original PDF question number isn't stored, so order_index+1
          // is the best available stand-in for matching a marking scheme --
          // correct as long as questions haven't been reordered since import.
          sourceNumber: q.order_index + 1,
        }))
      )
      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [quizId, user.id])

  const updateQuestion = (index, updated) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
  }

  const deleteQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const addQuestion = () => {
    setQuestions((prev) => [...prev, makeBlankQuestion()])
  }

  const canSave =
    title.trim().length > 0 &&
    timeLimit > 0 &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q.text.trim() &&
        Object.keys(q.options).length >= 2 &&
        Object.values(q.options).every((opt) => opt.trim().length > 0) &&
        q.correctOption
    )

  const handleSave = async () => {
    setSaveError('')
    setSaving(true)

    try {
      const { error: quizError } = await supabase
        .from('quizzes')
        .update({ title: title.trim(), time_limit_minutes: Number(timeLimit) })
        .eq('id', quizId)
      if (quizError) throw quizError

      // Simplest correct way to reconcile an edited question list (some
      // added, some deleted, some reordered) against the DB: replace all of
      // this quiz's questions rather than trying to diff individual rows.
      // quiz_answers cascades on delete, and existing images keep their
      // already-hosted URL (the storage object itself isn't touched).
      // Note: a student with this quiz already open in their browser holds
      // the OLD question ids: if they submit after this save, submit_quiz's
      // grading join won't find those ids among the new rows and will
      // score their attempt as 0. Rare in practice, but a real limitation
      // of this delete+recreate approach -- avoid editing a quiz while
      // someone may be actively taking it.
      const { error: deleteError } = await supabase.from('questions').delete().eq('quiz_id', quizId)
      if (deleteError) throw deleteError

      const questionRows = questions.map((q, index) => ({
        quiz_id: quizId,
        question_text: q.text.trim(),
        options: q.options,
        image_url: q.imageUrl || null,
        order_index: index,
      }))

      const { data: insertedQuestions, error: questionsError } = await supabase
        .from('questions')
        .insert(questionRows)
        .select()
      if (questionsError) throw questionsError

      const byOrder = new Map(insertedQuestions.map((row) => [row.order_index, row]))
      const answerRows = questions.map((q, index) => ({
        question_id: byOrder.get(index).id,
        correct_option: q.correctOption,
      }))

      const { error: answersError } = await supabase.from('quiz_answers').insert(answerRows)
      if (answersError) throw answersError

      // A freshly-attached diagram (e.g. a question added by hand after the
      // fact) could in principle carry a local Blob -- upload any that do.
      const uploads = questions
        .map((q, index) => ({ blob: q.diagramBlob, row: byOrder.get(index) }))
        .filter((u) => u.blob)
        .map(async ({ blob, row }) => {
          const path = `${quizId}/${row.id}.png`
          const { error: uploadError } = await supabase.storage
            .from('quiz-diagrams')
            .upload(path, blob, { contentType: 'image/png' })
          if (uploadError) throw uploadError

          const { data: publicUrlData } = supabase.storage.from('quiz-diagrams').getPublicUrl(path)
          const { error: updateError } = await supabase
            .from('questions')
            .update({ image_url: publicUrlData.publicUrl })
            .eq('id', row.id)
          if (updateError) throw updateError
        })

      await Promise.all(uploads)

      navigate('/dashboard')
    } catch (err) {
      setSaveError(err.message || 'Something went wrong while saving.')
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading quiz…" />

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
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <button onClick={() => navigate('/dashboard')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-slate-900">Edit Quiz</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <QuizEditorForm
          title={title}
          onTitleChange={setTitle}
          timeLimit={timeLimit}
          onTimeLimitChange={setTimeLimit}
          questions={questions}
          onQuestionChange={updateQuestion}
          onQuestionDelete={deleteQuestion}
          onAddQuestion={addQuestion}
          warnings={warnings}
          msParsing={msParsing}
          msResult={msResult}
          onMarkSchemeFile={handleMarkSchemeFile}
          onCancel={() => navigate('/dashboard')}
          cancelLabel="← Back to dashboard"
          onSave={handleSave}
          saving={saving}
          saveError={saveError}
          canSave={canSave}
          saveLabel="Save Changes"
        />
      </main>
    </div>
  )
}
