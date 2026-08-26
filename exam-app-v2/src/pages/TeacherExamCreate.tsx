import { ChangeEvent, FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { docxFileToHtml, splitQuestionsFromHtml } from '../utils/docxParser'
import { MCQOption, QuestionPart, ScoringMethod, TrueFalseOption } from '../types'
import MathRenderer from '../components/MathRenderer'

interface DraftQuestion {
  key: string
  order_index: number
  part: QuestionPart
  content_html: string
  options: MCQOption[] | TrueFalseOption[]
  correct_answer: string
  explanation_html: string
  points: number
}

function emptyMcq(): MCQOption[] {
  return ['A', 'B', 'C', 'D'].map((k) => ({ key: k, html: '' }))
}
function emptyTF(): TrueFalseOption[] {
  return ['a', 'b', 'c', 'd'].map((k) => ({ key: k, html: '', correct: false }))
}

export default function TeacherExamCreate() {
  const { classId } = useParams()
  const { teacher } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [waveNumber, setWaveNumber] = useState(1)
  const [duration, setDuration] = useState(90)
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('ministry_partial')
  const [requiresPrev, setRequiresPrev] = useState(true)
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUploadWord(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    const { html } = await docxFileToHtml(file)
    const blocks = splitQuestionsFromHtml(html)
    const drafts: DraftQuestion[] = blocks.map((html, i) => ({
      key: uuid(),
      order_index: questions.length + i + 1,
      part: 'mcq',
      content_html: html,
      options: emptyMcq(),
      correct_answer: 'A',
      explanation_html: '',
      points: 0.25,
    }))
    setQuestions((prev) => [...prev, ...drafts])
    setParsing(false)
  }

  function addManualQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        key: uuid(),
        order_index: prev.length + 1,
        part: 'mcq',
        content_html: '<p>Nhập nội dung câu hỏi...</p>',
        options: emptyMcq(),
        correct_answer: 'A',
        explanation_html: '',
        points: 0.25,
      },
    ])
  }

  function updateQuestion(key: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)))
  }

  function changePart(key: string, part: QuestionPart) {
    updateQuestion(key, {
      part,
      options: part === 'mcq' ? emptyMcq() : part === 'true_false' ? emptyTF() : [],
      correct_answer: '',
    })
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => prev.filter((q) => q.key !== key))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (questions.length === 0) return setError('Đề thi cần ít nhất 1 câu hỏi.')
    setSaving(true)
    try {
      const { data: exam, error: examErr } = await supabase
        .from('exams')
        .insert({
          teacher_id: teacher!.id,
          class_id: classId,
          title,
          wave_number: waveNumber,
          duration_minutes: duration,
          open_at: new Date(openAt).toISOString(),
          close_at: new Date(closeAt).toISOString(),
          scoring_method: scoringMethod,
          requires_previous_wave: requiresPrev,
        })
        .select()
        .single()
      if (examErr) throw examErr

      const rows = questions.map((q, i) => ({
        exam_id: exam.id,
        order_index: i + 1,
        part: q.part,
        content_html: q.content_html,
        options: q.part === 'short_answer' ? null : q.options,
        correct_answer: q.part === 'true_false' ? null : q.correct_answer,
        explanation_html: q.explanation_html,
        points: q.points,
      }))
      const { error: qErr } = await supabase.from('questions').insert(rows)
      if (qErr) throw qErr

      navigate(`/teacher/classes/${classId}`)
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi lưu đề thi.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container">
      <form onSubmit={handleSave}>
        <div className="card">
          <h2>1. Thiết lập đợt thi</h2>
          <label>Tên đề thi</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Đợt thi số</label>
              <input
                type="number"
                min={1}
                value={waveNumber}
                onChange={(e) => setWaveNumber(Number(e.target.value))}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Thời lượng (phút)</label>
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Giờ mở cổng thi</label>
              <input
                type="datetime-local"
                value={openAt}
                onChange={(e) => setOpenAt(e.target.value)}
                required
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Giờ đóng cổng thi</label>
              <input
                type="datetime-local"
                value={closeAt}
                onChange={(e) => setCloseAt(e.target.value)}
                required
              />
            </div>
          </div>

          <label>Cách tính điểm câu Đúng/Sai (4 ý)</label>
          <select
            value={scoringMethod}
            onChange={(e) => setScoringMethod(e.target.value as ScoringMethod)}
          >
            <option value="ministry_partial">
              Theo Bộ GDĐT: đúng 1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1đ (thang điểm câu)
            </option>
            <option value="equal_split">Chia đều: điểm câu × (số ý đúng / tổng số ý)</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', marginBottom: 0 }}
              checked={requiresPrev}
              onChange={(e) => setRequiresPrev(e.target.checked)}
            />
            Yêu cầu học sinh phải hoàn thành đợt thi trước (đợt #{waveNumber - 1}) mới được thi
            đợt này. Nếu bỏ thi đợt trước, học sinh sẽ bị loại khỏi đợt này cho đến khi hoàn
            thành đợt bỏ dở.
          </label>
        </div>

        <div className="card">
          <h2>2. Tải đề thi từ file Word (tùy chọn)</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Hệ thống tự tách câu hỏi theo mốc "Câu 1:", "Câu 2:"... và giữ nguyên mọi hình ảnh
            trong file. Công thức MathType nên được chuyển thành ảnh trước khi chèn vào Word
            (hoặc gõ trực tiếp bằng LaTeX trong cặp dấu $...$) để hiển thị chính xác 100% trên
            web — xem chi tiết trong README.
          </p>
          <input type="file" accept=".docx" onChange={handleUploadWord} />
          {parsing && <p>Đang xử lý file...</p>}
          <button type="button" className="btn secondary" onClick={addManualQuestion}>
            + Thêm câu hỏi thủ công
          </button>
        </div>

        <div className="card">
          <h2>3. Biên soạn câu hỏi ({questions.length})</h2>
          {questions.map((q) => (
            <div className="question-block" key={q.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>Câu {q.order_index}</b>
                <button type="button" className="btn danger" onClick={() => removeQuestion(q.key)}>
                  Xóa
                </button>
              </div>

              <label>Nội dung câu hỏi (HTML — có thể chỉnh sửa trực tiếp)</label>
              <textarea
                rows={4}
                value={q.content_html}
                onChange={(e) => updateQuestion(q.key, { content_html: e.target.value })}
              />
              <MathRenderer html={q.content_html} className="card" />

              <label>Dạng câu hỏi</label>
              <select value={q.part} onChange={(e) => changePart(q.key, e.target.value as QuestionPart)}>
                <option value="mcq">Trắc nghiệm 4 đáp án</option>
                <option value="true_false">Đúng / Sai (4 ý)</option>
                <option value="short_answer">Trả lời ngắn</option>
              </select>

              <label>Điểm câu này</label>
              <input
                type="number"
                step={0.05}
                value={q.points}
                onChange={(e) => updateQuestion(q.key, { points: Number(e.target.value) })}
              />

              {q.part === 'mcq' && (
                <>
                  {(q.options as MCQOption[]).map((opt, idx) => (
                    <div key={opt.key} className="tf-row">
                      <b>{opt.key}.</b>
                      <input
                        value={opt.html}
                        placeholder={`Nội dung đáp án ${opt.key}`}
                        onChange={(e) => {
                          const next = [...(q.options as MCQOption[])]
                          next[idx] = { ...next[idx], html: e.target.value }
                          updateQuestion(q.key, { options: next })
                        }}
                      />
                    </div>
                  ))}
                  <label>Đáp án đúng</label>
                  <select
                    value={q.correct_answer}
                    onChange={(e) => updateQuestion(q.key, { correct_answer: e.target.value })}
                  >
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
                        placeholder={`Nội dung ý ${opt.key}`}
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
                            updateQuestion(q.key, { options: next })
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
                  <input
                    value={q.correct_answer}
                    onChange={(e) => updateQuestion(q.key, { correct_answer: e.target.value })}
                  />
                </>
              )}

              <label>Lời giải chi tiết (hiển thị cho học sinh sau khi nộp bài)</label>
              <textarea
                rows={3}
                value={q.explanation_html}
                onChange={(e) => updateQuestion(q.key, { explanation_html: e.target.value })}
              />
            </div>
          ))}
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu đề thi'}
        </button>
      </form>
    </div>
  )
}
