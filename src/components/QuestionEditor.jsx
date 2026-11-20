import { useEffect, useMemo } from 'react'
import { Trash2, Plus, ImageOff, ImagePlus, Undo2 } from 'lucide-react'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function QuestionEditor({ question, index, onChange, onDelete }) {
  const optionKeys = Object.keys(question.options)

  // question.diagramBlob is a local Blob (auto-cropped from an uploaded PDF,
  // or picked by the teacher) -- it needs an object URL to preview.
  // question.imageUrl is already a real hosted URL (e.g. after a save/reload)
  // and needs no conversion.
  const objectUrl = useMemo(
    () => (question.diagramBlob ? URL.createObjectURL(question.diagramBlob) : null),
    [question.diagramBlob]
  )
  useEffect(() => () => objectUrl && URL.revokeObjectURL(objectUrl), [objectUrl])

  const imageSrc = objectUrl || question.imageUrl

  const updateText = (text) => onChange({ ...question, text })

  const updateOption = (letter, value) => {
    onChange({ ...question, options: { ...question.options, [letter]: value } })
  }

  const setCorrect = (letter) => onChange({ ...question, correctOption: letter })

  const addOption = () => {
    const nextLetter = OPTION_LETTERS.find((l) => !optionKeys.includes(l))
    if (!nextLetter) return
    onChange({ ...question, options: { ...question.options, [nextLetter]: '' } })
  }

  const removeOption = (letter) => {
    const { [letter]: _removed, ...rest } = question.options
    const correctOption = question.correctOption === letter ? null : question.correctOption
    onChange({ ...question, options: rest, correctOption })
  }

  // Removing an image doesn't discard it -- it's stashed on the question so
  // an accidental click can be undone, since this is the only copy of an
  // auto-cropped diagram (there's no server copy yet at this review stage).
  const removeImage = () =>
    onChange({
      ...question,
      diagramBlob: null,
      imageUrl: null,
      removedDiagramBlob: question.diagramBlob,
      removedImageUrl: question.imageUrl,
    })

  const undoRemoveImage = () =>
    onChange({
      ...question,
      diagramBlob: question.removedDiagramBlob,
      imageUrl: question.removedImageUrl,
      removedDiagramBlob: null,
      removedImageUrl: null,
    })

  const uploadImage = (file) =>
    onChange({
      ...question,
      diagramBlob: file,
      imageUrl: null,
      removedDiagramBlob: null,
      removedImageUrl: null,
    })

  return (
    <div className={`rounded-xl border p-4 ${question.correctOption ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
          {index + 1}
        </span>
        <textarea
          value={question.text}
          onChange={(e) => updateText(e.target.value)}
          placeholder="Question text"
          rows={2}
          className="min-h-[2.5rem] flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="button"
          onClick={onDelete}
          title="Delete question"
          className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {imageSrc ? (
        <div className="ml-9 mt-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Diagram/figure for this question:</p>
          <div className="relative inline-block max-w-full rounded-lg border border-slate-200 bg-white p-2">
            <img src={imageSrc} alt="Question diagram" className="max-h-64 max-w-full rounded" />
            <button
              type="button"
              onClick={removeImage}
              title="Remove this image"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600"
            >
              <ImageOff className="h-3.5 w-3.5" />
            </button>
          </div>
          <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            <ImagePlus className="h-3.5 w-3.5" /> Replace with your own image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadImage(e.target.files[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      ) : (
        <div className="ml-9 mt-3 space-y-1.5">
          {(question.removedDiagramBlob || question.removedImageUrl) && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <ImageOff className="h-3.5 w-3.5 shrink-0" />
              Image removed.
              <button
                type="button"
                onClick={undoRemoveImage}
                className="flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800"
              >
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </button>
            </div>
          )}
          <label className="flex w-fit cursor-pointer items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
            <ImagePlus className="h-3.5 w-3.5" /> Add an image for this question (optional)
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) uploadImage(e.target.files[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}

      <div className="mt-3 ml-9 space-y-2">
        {optionKeys.map((letter) => (
          <div key={letter} className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correctOption === letter}
                onChange={() => setCorrect(letter)}
                className="h-4 w-4 accent-indigo-600"
              />
              {letter}
            </label>
            <input
              type="text"
              value={question.options[letter]}
              onChange={(e) => updateOption(letter, e.target.value)}
              placeholder={`Option ${letter}`}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {optionKeys.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(letter)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {optionKeys.length < OPTION_LETTERS.length && (
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add option
          </button>
        )}

        {!question.correctOption && (
          <p className="text-xs font-medium text-amber-700">Select the correct option above.</p>
        )}
      </div>
    </div>
  )
}
