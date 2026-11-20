import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Spinner from './components/Spinner'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CreateQuiz = lazy(() => import('./pages/CreateQuiz'))
const QuizResults = lazy(() => import('./pages/QuizResults'))
const StudentQuizPage = lazy(() => import('./pages/student/StudentQuizPage'))

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner label="Loading…" />
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<Spinner label="Loading…" />}>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<AuthPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create"
              element={
                <ProtectedRoute>
                  <CreateQuiz />
                </ProtectedRoute>
              }
            />
            <Route
              path="/results/:quizId"
              element={
                <ProtectedRoute>
                  <QuizResults />
                </ProtectedRoute>
              }
            />
            <Route path="/quiz/:quizId" element={<StudentQuizPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}
