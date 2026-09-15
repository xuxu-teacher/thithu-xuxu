import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useAuth } from '../context/AuthContext'
import { parseWordExam } from '../utils/docxParser'
import { classifyQuestions, ClassifiedQuestionData } from '../utils/classifyQuestions'
import { saveQuestionsToBank, BankDraftQuestion } from '../utils/questionBank'
import { handlePasteImage, fileToImgTag } from '../utils/imagePaste'
import { MCQOption, QuestionDifficulty, QuestionPart, TrueFalseOption } from '../types'
import { getCurriculumTopics } from '../data/curriculumTopics'
import QuestionBankBrowser from '../components/QuestionBankBrowser'
import QuestionFullPreview from '../components/QuestionFullPreview'
import MathRenderer from '../components/MathRenderer'

const DIFFICULTIES: QuestionDifficulty[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']
const GRADES: ('10' | '11' | '12')[] = ['10', '11', '12']

function emptyMcq(): MCQOption[] {
  return ['A', 'B', 'C', 'D'].map((k) => ({ key: k, html: '' }))
}
function emptyTF(): TrueFalseOption[] {
  return ['a', 'b', 'c', 'd'].map((k) => ({ key: k, html: '', correct: false }))
}

export default function TeacherQuestionBankUpload() {
  const { teacher } = useAuth()

  const [processing, setProcessing] = useState(false)
  const [progressNote, setProgressNote] = useState<string | null>(null)
  const [draft, setDraft] = useState<BankDraftQuestion[]>([])
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({})
  const cancelRef = useRef(false)

  function handleCancel() {
    cancelRef.current = true
    setProgressNote((prev) => `${prev || ''}\n⏹ Đang dừng lại sau khi xử lý xong file hiện tại...`)
  }

  async function handleSelectFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || [])
    if (list.length === 0) return
    e.target.value = ''

    setError(null)
    setProcessing(true)
    setSavedCount(null)
    cancelRef.current = false
    const allParsed: ClassifiedQuestionData[][] = []
    const processedFiles: File[] = []
    try {
      for (let i = 0; i < list.length; i++) {
        if (cancelRef.current) break
        const file = list[i]
        setProgressNote(`Đang đọc file ${i + 1}/${list.length}: ${file.name}...`)
        const result = await parseWordExam(file)
        const withKeys = result.questions.map((q) => ({ ...q, key: uuid() }))

        if (cancelRef.current) break
        setProgressNote(`Đang nhận diện khối lớp/chủ đề/mức độ cho ${withKeys.length} câu trong ${file.name}...`)
        const classified = await classifyQuestions(withKeys)
        allParsed.push(classified)
        processedFiles.push(file)
      }

      const merged: BankDraftQuestion[] = allParsed.flatMap((qs, fileIdx) =>
        qs.map((q) => ({ ...q, sourceFile: processedFiles[fileIdx].name })),
      )
      setDraft((prev) => [...prev, ...merged])
      setProgressNote(
        cancelRef.current
          ? `Đã dừng — vẫn giữ lại ${merged.length} câu đã kịp xử lý từ ${processedFiles.length}/${list.length} file trước khi hủy. Rà lại bên dưới rồi bấm "Lưu vào kho".`
          : `Xong — đã đọc và phân loại ${merged.length} câu từ ${list.length} file. Rà lại bên dưới (đặc biệt các câu có cờ ⚠, kiểm tra kỹ cột Khối) rồi bấm "Lưu vào kho".`,
      )
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi đọc/phân loại file.')
    } finally {
      setProcessing(false)
      cancelRef.current = false
    }
  }

  function updateDraft(key: string, patch: Partial<BankDraftQuestion>) {
    setDraft((prev) =>
      prev.map((q) => {
        if (q.key !== key) return q
        const next = { ...q, ...patch }
        // Đổi khối thì chủ đề cũ (của khối khác) không còn hợp lệ nữa — tự
        // chọn lại chủ đề đầu tiên của khối mới để tránh lưu sai chủ đề.
        if (patch.grade && patch.grade !== q.grade) {
          next.topic = getCurriculumTopics(patch.grade)[0]
        }
        return next
      }),
    )
  }

  function changePart(key: string, part: QuestionPart) {
    updateDraft(key, {
      part,
      options: part === 'mcq' ? emptyMcq() : part === 'true_false' ? emptyTF() : [],
      correct_answer: '',
    })
  }

  function removeDraft(key: string) {
    setDraft((prev) => prev.filter((q) => q.key !== key))
  }

  function removeFileGroup(sourceFile: string) {
    setDraft((prev) => prev.filter((q) => q.sourceFile !== sourceFile))
  }

  async function handleSaveAll() {
    if (draft.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await saveQuestionsToBank(teacher!.id, draft)
      setSavedCount(draft.length)
      setDraft([])
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi lưu vào kho câu hỏi.')
    } finally {
      setSaving(false)
    }
  }

  const visibleDraft = onlyFlagged ? draft.filter((q) => q.needsTopicReview || q.needsReview) : draft
  const flaggedCount = draft.filter((q) => q.needsTopicReview || q.needsReview).length

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📚 Kho câu hỏi — Tải đề lên & tự phân loại</h2>
        <p style={{ fontSize: 13 }}>
          Tải lên <b>nhiều file Word</b> cùng lúc (đề thi thử của nhiều năm/nhiều trường bạn sưu tầm hoặc tự soạn) —
          hệ thống tự tách câu hỏi, rồi dùng AI tự nhận diện <b>khối lớp</b> (10/11/12 — không cần chọn trước,
          AI tự đoán theo nội dung câu hỏi), <b>chủ đề</b> (theo đúng chương trình SGK Toán Kết nối tri thức) và{' '}
          <b>mức độ nhận thức</b> (Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao). Không cần Google Drive hay bất
          kỳ dịch vụ trả phí nào — toàn bộ câu hỏi được lưu ngay trong Supabase (miễn phí) của bạn, càng tải nhiều
          file, kho càng đa dạng.
        </p>

        <label>Chọn nhiều file Word (.docx) — có thể lẫn câu của nhiều khối khác nhau trong cùng 1 file</label>
        <input type="file" accept=".docx" multiple onChange={handleSelectFiles} disabled={processing} />
        {processing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{progressNote}</p>
            <button type="button" className="btn danger" onClick={handleCancel} disabled={cancelRef.current}>
              ⏹ Hủy tải lên
            </button>
          </div>
        )}
        {!processing && progressNote && <div className="explanation" style={{ whiteSpace: 'pre-line' }}>{progressNote}</div>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {savedCount !== null && <div className="explanation">✅ Đã lưu {savedCount} câu vào kho câu hỏi.</div>}
      </div>

      {draft.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <h2>
              Duyệt trước khi lưu ({draft.length} câu{flaggedCount > 0 ? `, ${flaggedCount} câu cần rà lại` : ''})
            </h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', marginBottom: 0 }}
                checked={onlyFlagged}
                onChange={(e) => setOnlyFlagged(e.target.checked)}
              />
              Chỉ hiện câu cần rà lại
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0 16px' }}>
            {Array.from(new Set(draft.map((q) => q.sourceFile))).map((sourceFile) => {
              const count = draft.filter((q) => q.sourceFile === sourceFile).length
              return (
                <span key={sourceFile} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {sourceFile} ({count} câu)
                  <button
                    type="button"
                    className="btn danger"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => removeFileGroup(sourceFile)}
                    title={`Xóa toàn bộ câu hỏi từ file ${sourceFile}`}
                  >
                    ✕
                  </button>
                </span>
              )
            })}
          </div>

          {visibleDraft.map((q) => {
            const topicsForGrade = getCurriculumTopics(q.grade)
            return (
              <div className="question-block" key={q.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nguồn: {q.sourceFile}</b>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {(q.needsTopicReview || q.needsReview) && <span className="badge warn">⚠ Cần rà lại</span>}
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setPreviewOpen((p) => ({ ...p, [q.key]: !p[q.key] }))}
                    >
                      {previewOpen[q.key] ? '✏️ Sửa' : '👁 Xem đầy đủ'}
                    </button>
                    <button type="button" className="btn danger" onClick={() => removeDraft(q.key)}>
                      Xóa
                    </button>
                  </div>
                </div>

                {previewOpen[q.key] ? (
                  <QuestionFullPreview question={q} />
                ) : (
                  <>
                    <label>Nội dung câu hỏi</label>
                <textarea
                  rows={3}
                  value={q.content_html}
                  onChange={(e) => updateDraft(q.key, { content_html: e.target.value })}
                  onPaste={(e) => handlePasteImage(e, (img) => updateDraft(q.key, { content_html: q.content_html + img }))}
                />
                <label className="btn secondary" style={{ display: 'inline-flex', cursor: 'pointer', marginBottom: 12 }}>
                  📷 Chèn ảnh
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const img = await fileToImgTag(file)
                      updateDraft(q.key, { content_html: q.content_html + img })
                      e.target.value = ''
                    }}
                  />
                </label>
                <div className="card" style={{ background: '#fafbfe' }}>
                  <b style={{ fontSize: 11, color: 'var(--muted)' }}>Xem trước:</b>
                  <MathRenderer html={q.content_html} block />
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 110 }}>
                    <label>Khối</label>
                    <select value={q.grade} onChange={(e) => updateDraft(q.key, { grade: e.target.value as '10' | '11' | '12', needsTopicReview: false })}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          Khối {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label>Chủ đề</label>
                    <select value={q.topic} onChange={(e) => updateDraft(q.key, { topic: e.target.value, needsTopicReview: false })}>
                      {topicsForGrade.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label>Mức độ</label>
                    <select
                      value={q.difficulty}
                      onChange={(e) => updateDraft(q.key, { difficulty: e.target.value as QuestionDifficulty, needsTopicReview: false })}
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <label>Dạng câu hỏi</label>
                    <select value={q.part} onChange={(e) => changePart(q.key, e.target.value as QuestionPart)}>
                      <option value="mcq">Trắc nghiệm 4 đáp án</option>
                      <option value="true_false">Đúng / Sai (4 ý)</option>
                      <option value="short_answer">Trả lời ngắn</option>
                    </select>
                  </div>
                </div>

                {q.part === 'mcq' && (
                  <>
                    {(q.options as MCQOption[]).map((opt, idx) => (
                      <div key={opt.key} className="tf-row">
                        <b>{opt.key}.</b>
                        <input
                          style={{ flex: 1, marginBottom: 0 }}
                          value={opt.html}
                          onChange={(e) => {
                            const next = [...(q.options as MCQOption[])]
                            next[idx] = { ...next[idx], html: e.target.value }
                            updateDraft(q.key, { options: next })
                          }}
                        />
                      </div>
                    ))}
                    <label>Đáp án đúng</label>
                    <select value={q.correct_answer} onChange={(e) => updateDraft(q.key, { correct_answer: e.target.value })}>
                      {['A', 'B', 'C', 'D'].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {q.part === 'true_false' && (
                  <>
                    {(q.options as TrueFalseOption[]).map((opt, idx) => (
                      <div key={opt.key} className="tf-row">
                        <b>{opt.key})</b>
                        <input
                          style={{ flex: 1, marginBottom: 0 }}
                          value={opt.html}
                          onChange={(e) => {
                            const next = [...(q.options as TrueFalseOption[])]
                            next[idx] = { ...next[idx], html: e.target.value }
                            updateDraft(q.key, { options: next })
                          }}
                        />
                        <label style={{ margin: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            style={{ width: 'auto', marginBottom: 0 }}
                            checked={opt.correct}
                            onChange={(e) => {
                              const next = [...(q.options as TrueFalseOption[])]
                              next[idx] = { ...next[idx], correct: e.target.checked }
                              updateDraft(q.key, { options: next })
                            }}
                          />
                          Đúng
                        </label>
                      </div>
                    ))}
                  </>
                )}

                {q.part === 'short_answer' && (
                  <>
                    <label>Đáp án đúng</label>
                    <input value={q.correct_answer} onChange={(e) => updateDraft(q.key, { correct_answer: e.target.value })} />
                  </>
                )}

                <label>Lời giải chi tiết</label>
                <textarea
                  rows={2}
                  value={q.explanation_html || ''}
                  onChange={(e) => updateDraft(q.key, { explanation_html: e.target.value })}
                  onPaste={(e) => handlePasteImage(e, (img) => updateDraft(q.key, { explanation_html: (q.explanation_html || '') + img }))}
                />
                  </>
                )}
              </div>
            )
          })}

          <button className="btn" onClick={handleSaveAll} disabled={saving}>
            {saving ? 'Đang lưu...' : `Lưu ${draft.length} câu vào kho`}
          </button>
        </div>
      )}

      <QuestionBankBrowser />
    </div>
  )
}
