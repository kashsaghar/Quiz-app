import { supabase } from '../lib/supabaseClient'

const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Shared by CreateQuiz and EditQuiz: uploads every question's pending local
// diagramBlob (auto-cropped from a PDF, or picked by the teacher) to the
// quiz-diagrams storage bucket and points that question row at the
// resulting public URL. Questions with no diagramBlob are left untouched --
// an already-hosted imageUrl was already written as part of the row insert.
export async function uploadDiagramImages(questions, quizId, insertedQuestionsByOrder) {
  const uploads = questions
    .map((q, index) => ({ blob: q.diagramBlob, row: insertedQuestionsByOrder.get(index) }))
    .filter((u) => u.blob)
    .map(async ({ blob, row }) => {
      const contentType = blob.type || 'image/png'
      const extension = EXTENSION_BY_MIME[contentType] || 'png'
      const path = `${quizId}/${row.id}.${extension}`

      const { error: uploadError } = await supabase.storage.from('quiz-diagrams').upload(path, blob, {
        contentType,
        upsert: true,
      })
      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage.from('quiz-diagrams').getPublicUrl(path)
      const { error: updateError } = await supabase.from('questions').update({ image_url: publicUrlData.publicUrl }).eq('id', row.id)
      if (updateError) throw updateError
    })

  await Promise.all(uploads)
}
