// Persists a student's in-progress attempt (registration info, answers, and
// a fixed end-time) in localStorage so an accidental refresh does not wipe
// their answers or reset the countdown.

function storageKey(quizId) {
  return `quiz-progress:${quizId}`
}

export function loadProgress(quizId) {
  try {
    const raw = localStorage.getItem(storageKey(quizId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveProgress(quizId, progress) {
  try {
    localStorage.setItem(storageKey(quizId), JSON.stringify(progress))
  } catch {
    // localStorage unavailable (private mode, quota) — fail silently, the
    // test still works in-memory for the current page load.
  }
}

export function clearProgress(quizId) {
  try {
    localStorage.removeItem(storageKey(quizId))
  } catch {
    // ignore
  }
}
