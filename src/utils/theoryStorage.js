import { supabase } from '../lib/supabaseClient'

// Uploads a newly created theory exam's paper (public bucket) and, if
// provided, its marking scheme (private bucket), then points the exam row
// at both. Called once, right after the theory_exams row itself is inserted
// (its id is needed for the storage path), mirroring
// uploadDiagramImages()'s quiz-id-first pattern.
//
// markingSchemeFile is optional -- without one, the grading function falls
// back to having Gemini work out correct answers and mark allocation itself.
export async function uploadTheoryExamFiles(examId, examPaperFile, markingSchemeFile) {
  const examPaperPath = `${examId}/paper.pdf`
  const { error: paperError } = await supabase.storage
    .from('exam-papers')
    .upload(examPaperPath, examPaperFile, { contentType: 'application/pdf', upsert: true })
  if (paperError) throw paperError

  const { data: publicUrlData } = supabase.storage.from('exam-papers').getPublicUrl(examPaperPath)

  let markingSchemePath = null
  if (markingSchemeFile) {
    markingSchemePath = `${examId}/scheme.pdf`
    const { error: schemeError } = await supabase.storage
      .from('marking-schemes')
      .upload(markingSchemePath, markingSchemeFile, { contentType: 'application/pdf', upsert: true })
    if (schemeError) throw schemeError
  }

  const { error: updateError } = await supabase
    .from('theory_exams')
    .update({ exam_paper_url: publicUrlData.publicUrl, marking_scheme_path: markingSchemePath })
    .eq('id', examId)
  if (updateError) throw updateError
}

// Uploads a student's worked answer sheet and attaches it to their
// submission row via the attach_theory_answer_sheet() RPC (the only way the
// answer_sheet_path column can be written from the client).
export async function uploadStudentAnswerSheet(examId, submissionId, answerSheetFile) {
  const path = `${examId}/${submissionId}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('answer-sheets')
    .upload(path, answerSheetFile, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw uploadError

  const { error: attachError } = await supabase.rpc('attach_theory_answer_sheet', {
    p_submission_id: submissionId,
    p_answer_sheet_path: path,
  })
  if (attachError) throw attachError
}

// Fire-and-forget: asks the serverless grading function to grade a
// submission. Failures here are non-fatal for the student (their answer
// sheet is already saved) -- the teacher can retry grading from the results
// page if this never completes.
export async function triggerGrading(submissionId) {
  try {
    await fetch('/api/grade-theory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId }),
    })
  } catch {
    // Ignored on purpose -- see comment above.
  }
}
