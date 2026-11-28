import { createClient } from '@supabase/supabase-js'

// Server-only secrets -- these must be set in the Vercel project's
// Environment Variables (never with a VITE_ prefix, so Vite never inlines
// them into the browser bundle). See README.md "Theory exam feature".
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// Vercel Node functions default to a short timeout; grading a multi-page
// PDF can take a while, so ask for more (actual cap still depends on your
// Vercel plan -- Hobby plans may not grant the full 60s).
export const config = { maxDuration: 60 }

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    totalAwarded: { type: 'number' },
    totalMarks: { type: 'number' },
    overallFeedback: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          questionNumber: { type: 'string' },
          marksAwarded: { type: 'number' },
          marksPossible: { type: 'number' },
          feedback: { type: 'string' },
        },
        required: ['questionNumber', 'marksAwarded', 'marksPossible', 'feedback'],
      },
    },
  },
  required: ['totalAwarded', 'totalMarks', 'questions'],
}

function buildPromptWithScheme(totalMarks) {
  return `You are a strict, fair examiner grading a student's handwritten exam answers.

You are given three PDF documents, in this order:
1. The exam question paper.
2. The official marking scheme — the ONLY source of truth for correct answers and mark allocation.
3. The student's scanned/photographed worked answer sheet.

Grade the student's answers strictly according to the marking scheme. For every question in the marking scheme:
- Find the student's answer for that question on their answer sheet (match by question number).
- Award marks per the marking scheme's rules. Accept answers that are mathematically/logically equivalent to what the marking scheme expects, and give partial credit exactly where the marking scheme allows it.
- If the student did not attempt a question, award 0 marks and say "Not attempted" in that question's feedback.
- If the handwriting for a question is illegible, award 0 marks and say "Illegible" — never guess at an answer you can't actually read.

The exam is out of ${totalMarks} marks in total. totalAwarded must equal the sum of every question's marksAwarded, and must never exceed ${totalMarks}. Return ONLY the JSON described by the response schema — no extra commentary.`
}

// Used when the teacher didn't upload a marking scheme. Gemini has to act
// as its own subject-matter expert: work out the correct/ideal answer for
// each question from the exam paper itself, decide a fair mark allocation
// per question (using marks shown on the paper, e.g. "[5 marks]", wherever
// present), and grade the student against that self-determined standard.
function buildPromptWithoutScheme(totalMarks) {
  return `You are a strict, fair, subject-matter-expert examiner grading a student's handwritten exam answers. No marking scheme was provided, so you must act as the examiner AND the marking-scheme author.

You are given two PDF documents, in this order:
1. The exam question paper.
2. The student's scanned/photographed worked answer sheet.

For every question on the paper:
- Work out the correct/ideal answer yourself, using your own subject knowledge.
- Decide a fair mark allocation for that question. If the paper itself states marks for a question (e.g. "[5 marks]" or "(10)"), use that. Otherwise split the ${totalMarks} total marks across all questions in a way that reflects their apparent length/difficulty (longer, multi-part, or clearly harder questions should be worth more).
- Find the student's answer for that question on their answer sheet (match by question number) and award marks based on how closely it matches the correct answer, giving partial credit for a partially correct or partially complete response.
- If the student did not attempt a question, award 0 marks and say "Not attempted" in that question's feedback.
- If the handwriting for a question is illegible, award 0 marks and say "Illegible" — never guess at an answer you can't actually read.
- In each question's feedback, briefly state what you decided the correct answer/marking criteria was, since there is no marking scheme to refer back to.

The exam is out of ${totalMarks} marks in total. Every question's marksPossible across the whole exam must sum to exactly ${totalMarks}, and totalAwarded must equal the sum of every question's marksAwarded. Return ONLY the JSON described by the response schema — no extra commentary.`
}

async function fetchAsBase64(supabaseAdmin, bucket, path) {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)
  if (error) throw new Error(`Could not download ${bucket}/${path}: ${error.message}`)
  const buffer = Buffer.from(await data.arrayBuffer())
  return buffer.toString('base64')
}

async function fetchPublicUrlAsBase64(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download exam paper (HTTP ${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return buffer.toString('base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' })
  }

  const { submissionId } = req.body || {}
  if (!submissionId) {
    return res.status(400).json({ error: 'submissionId is required' })
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: submission, error: subError } = await supabaseAdmin
      .from('theory_submissions')
      .select('id, exam_id, answer_sheet_path, status')
      .eq('id', submissionId)
      .single()
    if (subError || !submission) throw new Error('Submission not found')
    if (!submission.answer_sheet_path) throw new Error('No answer sheet uploaded for this submission yet')

    // Idempotent: a retry/regrade on an already-graded submission just
    // regrades it from scratch rather than erroring.
    await supabaseAdmin.from('theory_submissions').update({ status: 'grading', error_message: null }).eq('id', submissionId)

    const { data: exam, error: examError } = await supabaseAdmin
      .from('theory_exams')
      .select('id, total_marks, exam_paper_url, marking_scheme_path')
      .eq('id', submission.exam_id)
      .single()
    if (examError || !exam) throw new Error('Exam not found')
    if (!exam.exam_paper_url) throw new Error('This exam has no exam paper uploaded')

    const hasMarkingScheme = Boolean(exam.marking_scheme_path)
    const parts = [{ text: hasMarkingScheme ? buildPromptWithScheme(exam.total_marks) : buildPromptWithoutScheme(exam.total_marks) }]

    const examPaperB64 = await fetchPublicUrlAsBase64(exam.exam_paper_url)
    parts.push({ inlineData: { mimeType: 'application/pdf', data: examPaperB64 } })

    if (hasMarkingScheme) {
      const markingSchemeB64 = await fetchAsBase64(supabaseAdmin, 'marking-schemes', exam.marking_scheme_path)
      parts.push({ inlineData: { mimeType: 'application/pdf', data: markingSchemeB64 } })
    }

    const answerSheetB64 = await fetchAsBase64(supabaseAdmin, 'answer-sheets', submission.answer_sheet_path)
    parts.push({ inlineData: { mimeType: 'application/pdf', data: answerSheetB64 } })

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      throw new Error(`Gemini API error (HTTP ${geminiRes.status}): ${errText.slice(0, 500)}`)
    }

    const geminiJson = await geminiRes.json()
    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned no content')

    const result = JSON.parse(text)
    const clampedMarks = Math.max(0, Math.min(Number(result.totalAwarded) || 0, exam.total_marks))

    await supabaseAdmin
      .from('theory_submissions')
      .update({
        status: 'graded',
        marks_awarded: clampedMarks,
        grading_feedback: result,
        graded_at: new Date().toISOString(),
      })
      .eq('id', submissionId)

    return res.status(200).json({ ok: true, marksAwarded: clampedMarks, totalMarks: exam.total_marks })
  } catch (err) {
    await supabaseAdmin
      .from('theory_submissions')
      .update({ status: 'error', error_message: String(err.message || err).slice(0, 2000) })
      .eq('id', submissionId)
    return res.status(500).json({ error: String(err.message || err) })
  }
}
