import Papa from 'papaparse'

export function downloadSubmissionsCsv(quizTitle, submissions) {
  const rows = submissions.map((s) => ({
    'Student Name': s.student_name,
    'Roll Number': s.roll_number || 'N/A',
    Score: `${s.score} / ${s.total_questions}`,
    'Percentage': s.total_questions > 0 ? `${Math.round((s.score / s.total_questions) * 100)}%` : '0%',
    'Submitted At': new Date(s.submitted_at).toLocaleString(),
  }))

  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safeTitle = quizTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  link.href = url
  link.download = `${safeTitle || 'quiz'}_results.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
