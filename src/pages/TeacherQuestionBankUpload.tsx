import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useAuth } from '../context/AuthContext'
import { parseWordExam } from '../utils/docxParser'
import { classifyQuestions, ClassifiedQuestionData } from '../utils/classifyQuestions'
import { saveQuestionsToBank, BankDraftQuestion } from '../utils/questionBank'
import { QuestionDifficulty } from '../types'
import { getCurriculumTopics } from '../data/curriculumTopics'
import MathRenderer from '../components/MathRenderer'

const DIFFICULTIES: QuestionDifficulty[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']

export default function TeacherQuestionBankUpload() {
  const { teacher } = useAuth()
  const [grade, setGrade] = useState<'10' | '11' | '12'>('10')

  const [processing, setProcessing] = useState(false)
  const [progressNote, setProgressNote] = useState<string | null>(null)
  const [draft, setDraft] = useState<BankDraftQuestion[]>([])
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const cancelRef = useRef(false)

  const topics = getCurriculumTopics(grade)

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
        setProgressNote(`Đang phân loại chủ đề/mức độ cho ${withKeys.length} câu trong ${file.name}...`)
        const classified = await classifyQuestions(withKeys, grade, topics)
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
          : `Xong — đã đọc và phân loại ${merged.length} câu từ ${list.length} file. Rà lại bên dưới (đặc biệt các câu có cờ ⚠) rồi bấm "Lưu vào kho".`,
      )
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi đọc/phân loại file.')
    } finally {
      setProcessing(false)
      cancelRef.current = false
    }
  }

  function updateDraft(key: string, patch: Partial<BankDraftQuestion>) {
    setDraft((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)))
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
      await saveQuestionsToBank(teacher!.id, grade, {}, draft)
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
          hệ thống tự tách câu hỏi (dùng chung engine đọc Word đang dùng khi tạo đề), rồi dùng AI tự gán{' '}
          <b>chủ đề</b> (theo đúng chương trình SGK Toán Kết nối tri thức của từng khối) và <b>mức độ nhận thức</b>{' '}
          (Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao). Không cần Google Drive hay bất kỳ dịch vụ trả phí nào — toàn bộ
          câu hỏi được lưu ngay trong Supabase (miễn phí) của bạn, càng tải nhiều file, kho càng đa dạng.
        </p>

        <label>Khối lớp</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value as '10' | '11' | '12')} style={{ maxWidth: 200 }}>
          <option value="10">Khối 10</option>
          <option value="11">Khối 11</option>
          <option value="12">Khối 12</option>
        </select>

        {topics.length === 0 ? (
          <p style={{ color: 'var(--danger)', fontSize: 13 }}>
            Khối {grade} chưa có danh sách chủ đề — báo lỗi cho quản trị viên.
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Chủ đề theo SGK Kết nối tri thức Khối {grade} ({topics.length} chương): {topics.join(', ')}
          </p>
        )}

        <label>Chọn nhiều file Word (.docx)</label>
        <input type="file" accept=".docx" multiple onChange={handleSelectFiles} disabled={topics.length === 0 || processing} />
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
        {savedCount !== null && <div className="explanation">✅ Đã lưu {savedCount} câu vào kho câu hỏi Khối {grade}.</div>}
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

          {visibleDraft.map((q) => (
            <div className="question-block" key={q.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nguồn: {q.sourceFile}</b>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(q.needsTopicReview || q.needsReview) && <span className="badge warn">⚠ Cần rà lại</span>}
                  <button type="button" className="btn danger" onClick={() => removeDraft(q.key)}>
                    Xóa
                  </button>
                </div>
              </div>

              <div className="card" style={{ background: '#fafbfe' }}>
                <MathRenderer html={q.content_html} block />
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label>Chủ đề</label>
                  <select value={q.topic} onChange={(e) => updateDraft(q.key, { topic: e.target.value, needsTopicReview: false })}>
                    {topics.map((t) => (
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
                <div style={{ minWidth: 140 }}>
                  <label>Dạng câu hỏi</label>
                  <p style={{ margin: 0, padding: '10px 0', fontSize: 13.5 }}>
                    {q.part === 'mcq' ? 'Trắc nghiệm' : q.part === 'true_false' ? 'Đúng/Sai' : 'Trả lời ngắn'}
                  </p>
                </div>
              </div>
            </div>
          ))}

          <button className="btn" onClick={handleSaveAll} disabled={saving}>
            {saving ? 'Đang lưu...' : `Lưu ${draft.length} câu vào kho`}
          </button>
        </div>
      )}
    </div>
  )
}
