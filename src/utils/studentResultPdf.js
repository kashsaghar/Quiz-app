import { jsPDF } from 'jspdf'

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

const COLORS = {
  text: [30, 41, 59],
  muted: [100, 116, 139],
  correct: [5, 122, 85],
  wrong: [185, 28, 28],
  correctBg: [209, 250, 229],
  wrongBg: [254, 226, 226],
}

// Fetches an image URL and returns a data URL, or null if it can't be loaded
// (e.g. offline, or the image was removed) — a missing diagram should never
// stop the rest of the PDF from being generated.
async function toDataUrl(imageUrl) {
  try {
    const res = await fetch(imageUrl)
    const blob = await res.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export async function downloadStudentResultPdf(quizTitle, submission, questions) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const studentAnswers = submission.answers || {}
  let y = MARGIN

  const ensureSpace = (needed) => {
    if (y + needed > PAGE_HEIGHT - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  // --- Header -----------------------------------------------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COLORS.text)
  doc.text(quizTitle, MARGIN, y)
  y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.muted)
  const pct = submission.total_questions > 0 ? Math.round((submission.score / submission.total_questions) * 100) : 0
  const headerLines = [
    `Student: ${submission.student_name}${submission.roll_number ? `  ·  Roll Number: ${submission.roll_number}` : ''}`,
    `Score: ${submission.score} / ${submission.total_questions}  (${pct}%)`,
    `Submitted: ${new Date(submission.submitted_at).toLocaleString()}`,
  ]
  headerLines.forEach((line) => {
    doc.text(line, MARGIN, y)
    y += 15
  })

  y += 6
  doc.setDrawColor(226, 232, 240)
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y += 20

  // --- Questions ----------------------------------------------------------
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const studentOption = studentAnswers[q.id] ?? null
    const isCorrect = studentOption && q.correctOption && studentOption === q.correctOption
    const isBlank = !studentOption

    ensureSpace(40)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.text)
    const qLines = doc.splitTextToSize(`${i + 1}. ${q.question_text}`, CONTENT_WIDTH)
    qLines.forEach((line) => {
      ensureSpace(14)
      doc.text(line, MARGIN, y)
      y += 14
    })

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...(isBlank ? COLORS.muted : isCorrect ? COLORS.correct : COLORS.wrong))
    doc.text(isBlank ? 'Not answered' : isCorrect ? 'Correct' : 'Incorrect', MARGIN, y)
    y += 12

    if (q.image_url) {
      const dataUrl = await toDataUrl(q.image_url)
      const dims = dataUrl ? await getImageDimensions(dataUrl) : null
      if (dataUrl && dims) {
        const maxWidth = CONTENT_WIDTH * 0.7
        const maxHeight = 160
        const scale = Math.min(maxWidth / dims.width, maxHeight / dims.height, 1)
        const w = dims.width * scale
        const h = dims.height * scale
        ensureSpace(h + 10)
        doc.addImage(dataUrl, MARGIN + 14, y, w, h)
        y += h + 10
      }
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    Object.entries(q.options || {}).forEach(([letter, text]) => {
      const isStudentChoice = letter === studentOption
      const isCorrectChoice = letter === q.correctOption

      const optionLines = doc.splitTextToSize(`${letter}. ${text}`, CONTENT_WIDTH - 24)
      const tagText = isCorrectChoice ? '  (Correct answer)' : isStudentChoice ? "  (Student's answer)" : ''
      const blockHeight = optionLines.length * 13 + 6

      ensureSpace(blockHeight)

      if (isCorrectChoice || isStudentChoice) {
        doc.setFillColor(...(isCorrectChoice ? COLORS.correctBg : COLORS.wrongBg))
        doc.roundedRect(MARGIN + 14, y - 9, CONTENT_WIDTH - 14, blockHeight, 3, 3, 'F')
      }

      doc.setTextColor(...(isCorrectChoice ? COLORS.correct : isStudentChoice ? COLORS.wrong : COLORS.text))
      optionLines.forEach((line, idx) => {
        doc.text(idx === optionLines.length - 1 ? `${line}${tagText}` : line, MARGIN + 20, y)
        y += 13
      })
      y += 6
    })

    y += 10
  }

  const safeName = `${submission.student_name}_${quizTitle}`.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  doc.save(`${safeName || 'student'}_result.pdf`)
}
