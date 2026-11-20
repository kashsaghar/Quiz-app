import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { loadProgress, saveProgress } from '../../utils/studentProgress'
import Spinner from '../../components/Spinner'
import RegistrationGate from './RegistrationGate'
import ActiveTest from './ActiveTest'
import SubmittedScreen from './SubmittedScreen'

export default function StudentQuizPage() {
  const { quizId } = useParams()

  const [phase, setPhase] = useState('loading') // loading | not_found | register | active | submitted | error
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])

  const [studentName, setStudentName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [answers, setAnswers] = useState({})
  const [endTime, setEndTime] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const submittingRef = useRef(false)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: quizRow, error: quizError } = await supabase
        .from('quizzes')
        .select('id, title, time_limit_minutes')
        .eq('id', quizId)
        .single()

      if (quizError || !quizRow) {
        if (active) setPhase('not_found')
        return
      }

      const { data: questionRows, error: questionsError } = await supabase
        .from('questions')
        .select('id, question_text, options, image_url, order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: true })

      if (questionsError || !active) return

      if (!active) return
      setQuiz(quizRow)
      setQuestions(questionRows)

      const saved = loadProgress(quizId)
      if (saved?.submitted) {
        setStudentName(saved.studentName)
        setPhase('submitted')
      } else if (saved?.studentName && saved?.endTime) {
        setStudentName(saved.studentName)
        setRollNumber(saved.rollNumber || '')
        setAnswers(saved.answers || {})
        setEndTime(saved.endTime)
        setPhase('active') // if saved.endTime has already passed, the effect below auto-submits immediately
      } else {
        setPhase('register')
      }
    }

    load()
    return () => {
      active = false
    }
  }, [quizId])

  const handleStart = ({ studentName: name, rollNumber: roll }) => {
    const newEndTime = Date.now() + quiz.time_limit_minutes * 60 * 1000
    setStudentName(name)
    setRollNumber(roll)
    setAnswers({})
    setEndTime(newEndTime)
    saveProgress(quizId, { studentName: name, rollNumber: roll, answers: {}, endTime: newEndTime, submitted: false })
    setPhase('active')
  }

  const handleAnswer = (questionId, letter) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: letter }
      saveProgress(quizId, { studentName, rollNumber, answers: next, endTime, submitted: false })
      return next
    })
  }

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')

    const { error } = await supabase.rpc('submit_quiz', {
      p_quiz_id: quizId,
      p_student_name: studentName,
      p_roll_number: rollNumber || null,
      p_answers: answers,
    })

    if (error) {
      setSubmitError('Could not submit your test: ' + error.message + '. Please try again.')
      setSubmitting(false)
      submittingRef.current = false
      return
    }

    saveProgress(quizId, { studentName, rollNumber, answers, endTime, submitted: true })
    setSubmitting(false)
    setPhase('submitted')
  }, [quizId, studentName, rollNumber, answers, endTime])

  // If the saved progress had already expired before this page even loaded,
  // submit immediately once we're in the active phase.
  useEffect(() => {
    if (phase === 'active' && endTime && endTime <= Date.now() && !submittingRef.current) {
      handleSubmit()
    }
  }, [phase, endTime, handleSubmit])

  if (phase === 'loading') return <Spinner label="Loading quiz…" />

  if (phase === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-slate-600">This quiz link is invalid or no longer exists.</p>
      </div>
    )
  }

  if (phase === 'register') {
    return <RegistrationGate quiz={quiz} questionCount={questions.length} onStart={handleStart} />
  }

  if (phase === 'active') {
    return (
      <>
        <ActiveTest
          quiz={quiz}
          questions={questions}
          answers={answers}
          onAnswer={handleAnswer}
          endTime={endTime}
          onExpire={handleSubmit}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
        {submitError && (
          <div className="fixed inset-x-0 bottom-20 mx-auto w-fit rounded-lg bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
            {submitError}
          </div>
        )}
      </>
    )
  }

  if (phase === 'submitted') {
    // The "submitted" flag stays in localStorage (not cleared) so that
    // refreshing this page re-shows the confirmation instead of letting the
    // student register and attempt the quiz again.
    return <SubmittedScreen studentName={studentName} quizTitle={quiz.title} />
  }

  return null
}
