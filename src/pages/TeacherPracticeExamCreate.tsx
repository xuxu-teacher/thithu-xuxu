import { ChangeEvent, FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseWordExam, DraftQuestionData } from '../utils/docxParser'
import { handlePasteImage, fileToImgTag } from '../utils/imagePaste'
import { MCQOption, QuestionPart, TrueFalseOption } from '../types'
import MathRenderer from '../components/MathRenderer'

function emptyMcq(): MCQOption[] {
  return ['A', 'B', 'C', 'D'].map((k) => ({ key: k, html: '' }))
}
function emptyTF(): TrueFalseOption[] {
  return ['a', 'b', 'c', 'd'].map((k) => ({ key: k, html: '', correct: false }))
}

// ============================================================
// ĐỀ THI THỬ — khác đề thi chính thức ở chỗ: không cần giờ mở/đóng cổng,
// không cần đợt thi, học sinh làm LẠI ĐƯỢC KHÔNG GIỚI HẠN SỐ LẦN, tự chấm
// ngay tại trình duyệt. Dùng cho việc "tải 1 đề có sẵn lên cho học sinh
// luyện tự do", không phải đề kiểm tra lấy điểm.
// ============================================================

export default function TeacherPracticeExamCreate() {
  const { classId } = useParams()
  const { teacher } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(45)
  const [questions, setQuestions] = useState<DraftQuestionData[]>([])
  const [parsing, setParsing] = useState(false)
  const [parseNotice, setParseNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUploadWord(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setParseNotice(null)
    try {
      const result = await parseWordExam(file)
      setQuestions((prev) => [
        ...prev,
        ...result.questions.map((q, i) => ({ ...q, key: uuid(), order_index: prev.length + i + 1 })),
      ])
      if (!title) setTitle(file.name.replace(/\.docx$/i, ''))

      const notices: string[] = [`Đã tách được ${result.questions.length} câu hỏi từ file Word.`]
      const needReview = result.questions.filter((q) => q.needsReview).length
      if (needReview > 0) {
        notices.push(`${needReview} câu được đánh dấu "⚠ Cần rà lại" bên dưới — kiểm tra lại đáp án trước khi lưu.`)
      }
      setParseNotice(notices.join(' '))
    } catch (err: any) {
      setParseNotice(`Lỗi khi đọc file Word: ${err.message || err}`)
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  function updateQuestion(key: string, patch: Partial<DraftQuestionData>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  }

  function changePart(key: string, part: QuestionPart) {
    updateQuestion(key, {
      part,
      options: part === 'mcq' ? emptyMcq() : part === 'true_false' ? emptyTF() : [],
      correct_answer: '',
      needsReview: false,
    })
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title) return setError('Điền tên đề thi thử.')
    if (questions.length === 0) return setError('Đề cần ít nhất 1 câu hỏi — tải file Word lên trước.')
    setSaving(true)
    try {
      const { data: pe, error: peErr } = await supabase
        .from('practice_exams')
        .insert({ teacher_id: teacher!.id, class_id: classId, title, duration_minutes: duration })
        .select()
        .single()
      if (peErr) throw peErr

      const rows = questions.map((q, i) => ({
        practice_exam_id: pe.id,
        order_index: i + 1,
        part: q.part,
        content_html: q.content_html,
        options: q.part === 'short_answer' ? null : q.options,
        correct_answer: q.part === 'true_false' ? null : q.correct_answer,
        explanation_html: q.explanation_html,
        points: q.points,
      }))
      const { error: qErr } = await supabase.from('practice_questions').insert(rows)
      if (qErr) throw qErr

      navigate(`/teacher/classes/${classId}`)
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi lưu đề thi thử.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container">
      <Link to={`/teacher/classes/${classId}`} className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Quay lại lớp
      </Link>

      <div className="card">
        <h2>📝 Tạo đề thi thử</h2>
        <p style={{ fontSize: 13 }}>
          Tải lên 1 file Word đề có sẵn — học sinh xem trong danh sách lớp và có thể làm{' '}
          <b>không giới hạn số lần</b>, tự chấm điểm ngay khi nộp, không cần giờ mở/đóng cổng, không tính vào
          điểm chính thức. Phù hợp để cho học sinh luyện tập tự do trước khi thi thật.
        </p>
      </div>

      <form onSubmit={handleSave}>
        <div className="card">
          <label>Tên đề thi thử</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Đề luyện tập Chương 1" />

          <label>Thời gian gợi ý làm bài (phút, chỉ để hiển thị, không tự nộp bài)</label>
          <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>

        <div className="card">
          <h2>Tải đề từ file Word</h2>
          <input type="file" accept=".docx" onChange={handleUploadWord} />
          {parsing && <p>Đang xử lý file...</p>}
          {parseNotice && <div className="explanation">{parseNotice}</div>}
        </div>

        {questions.length > 0 && (
          <div className="card">
            <h2>Câu hỏi ({questions.length})</h2>
            {questions.map((q) => (
              <div className="question-block" key={q.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>Câu {q.order_index}</b>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {q.needsReview && <span className="badge warn">⚠ Cần rà lại</span>}
                    <button type="button" className="btn danger" onClick={() => removeQuestion(q.key)}>
                      Xóa
                    </button>
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={q.content_html}
                  onChange={(e) => updateQuestion(q.key, { content_html: e.target.value })}
                  onPaste={(e) => handlePasteImage(e, (img) => updateQuestion(q.key, { content_html: q.content_html + img }))}
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
                      updateQuestion(q.key, { content_html: q.content_html + img })
                      e.target.value = ''
                    }}
                  />
                </label>
                <div className="card" style={{ background: '#fafbfe' }}>
                  <MathRenderer html={q.content_html} block />
                </div>

                <label>Dạng câu hỏi</label>
                <select value={q.part} onChange={(e) => changePart(q.key, e.target.value as QuestionPart)}>
                  <option value="mcq">Trắc nghiệm 4 đáp án</option>
                  <option value="true_false">Đúng / Sai (4 ý)</option>
                  <option value="short_answer">Trả lời ngắn</option>
                </select>

                {q.part === 'mcq' && (
                  <>
                    {(q.options as MCQOption[]).map((opt, idx) => (
                      <div key={opt.key} className="tf-row">
                        <b>{opt.key}.</b>
                        <input
                          style={{ marginBottom: 0 }}
                          value={opt.html}
                          onChange={(e) => {
                            const next = [...(q.options as MCQOption[])]
                            next[idx] = { ...next[idx], html: e.target.value }
                            updateQuestion(q.key, { options: next })
                          }}
                        />
                      </div>
                    ))}
                    <label>Đáp án đúng</label>
                    <select value={q.correct_answer} onChange={(e) => updateQuestion(q.key, { correct_answer: e.target.value, needsReview: false })}>
                      {['A', 'B', 'C', 'D'].map((k) => (
                        <option key={k} value={k}>{k}</option>
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
                            updateQuestion(q.key, { options: next })
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
                              updateQuestion(q.key, { options: next, needsReview: false })
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
                    <input value={q.correct_answer} onChange={(e) => updateQuestion(q.key, { correct_answer: e.target.value, needsReview: false })} />
                  </>
                )}

                <label>Lời giải chi tiết</label>
                <textarea
                  rows={2}
                  value={q.explanation_html}
                  onChange={(e) => updateQuestion(q.key, { explanation_html: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Xuất bản đề thi thử'}
        </button>
      </form>
    </div>
  )
}
