import { ChangeEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseWordExam } from '../utils/docxParser'
import { classifyQuestions, ClassifiedQuestionData } from '../utils/classifyQuestions'
import { saveQuestionsToBank, BankDraftQuestion } from '../utils/questionBank'
import { Chapter, QuestionDifficulty } from '../types'
import MathRenderer from '../components/MathRenderer'

const DIFFICULTIES: QuestionDifficulty[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']

export default function TeacherQuestionBankUpload() {
  const { teacher } = useAuth()
  const [grade, setGrade] = useState<'10' | '11' | '12'>('10')
  const [chapters, setChapters] = useState<Chapter[]>([])

  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progressNote, setProgressNote] = useState<string | null>(null)
  const [draft, setDraft] = useState<BankDraftQuestion[]>([])
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadChapters() {
      const { data } = await supabase
        .from('chapters')
        .select('*')
        .eq('teacher_id', teacher!.id)
        .eq('grade', grade)
        .order('order_index')
      setChapters((data as Chapter[]) || [])
    }
    if (teacher) loadChapters()
  }, [teacher, grade])

  const topics = chapters.map((c) => c.title)
  const chapterIdByTopic: Record<string, string> = Object.fromEntries(chapters.map((c) => [c.title, c.id]))

  async function handleSelectFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || [])
    if (list.length === 0) return
    setFiles(list)
    e.target.value = ''

    if (topics.length === 0) {
      setError(
        `Khối ${grade} chưa có Chương nào để làm danh sách chủ đề. Vào mục "Bài giảng" tạo Chương trước (chỉ cần tên chương, chưa cần bài giảng), rồi quay lại đây.`,
      )
      return
    }

    setError(null)
    setProcessing(true)
    setSavedCount(null)
    const allParsed: ClassifiedQuestionData[][] = []
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i]
        setProgressNote(`Đang đọc file ${i + 1}/${list.length}: ${file.name}...`)
        const result = await parseWordExam(file)
        const withKeys = result.questions.map((q) => ({ ...q, key: uuid() }))

        setProgressNote(`Đang phân loại chủ đề/mức độ cho ${withKeys.length} câu trong ${file.name}...`)
        const classified = await classifyQuestions(withKeys, grade, topics)
        allParsed.push(classified)
      }

      const merged: BankDraftQuestion[] = allParsed.flatMap((qs, fileIdx) =>
        qs.map((q) => ({ ...q, sourceFile: list[fileIdx].name })),
      )
      setDraft((prev) => [...prev, ...merged])
      setProgressNote(
        `Xong — đã đọc và phân loại ${merged.length} câu từ ${list.length} file. Rà lại bên dưới (đặc biệt các câu có cờ ⚠) rồi bấm "Lưu vào kho".`,
      )
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi đọc/phân loại file.')
    } finally {
      setProcessing(false)
    }
  }

  function updateDraft(key: string, patch: Partial<BankDraftQuestion>) {
    setDraft((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  }

  function removeDraft(key: string) {
    setDraft((prev) => prev.filter((q) => q.key !== key))
  }

  async function handleSaveAll() {
    if (draft.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await saveQuestionsToBank(teacher!.id, grade, chapterIdByTopic, draft)
      setSavedCount(draft.length)
      setDraft([])
      setFiles([])
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
          <b>chủ đề</b> (theo đúng danh sách Chương bạn đã tạo ở mục Bài giảng) và <b>mức độ nhận thức</b> (Nhận biết
          / Thông hiểu / Vận dụng / Vận dụng cao). Không cần Google Drive hay bất kỳ dịch vụ trả phí nào — toàn bộ
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
            Khối {grade} chưa có Chương nào. Vào <Link to="/teacher/lessons">Bài giảng</Link> tạo ít nhất 1 Chương
            trước (đây sẽ là danh sách chủ đề để AI phân loại).
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Chủ đề sẽ được chọn trong {topics.length} Chương của Khối {grade}: {topics.join(', ')}
          </p>
        )}

        <label>Chọn nhiều file Word (.docx)</label>
        <input type="file" accept=".docx" multiple onChange={handleSelectFiles} disabled={topics.length === 0 || processing} />
        {processing && <p>{progressNote}</p>}
        {!processing && progressNote && <div className="explanation">{progressNote}</div>}
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
