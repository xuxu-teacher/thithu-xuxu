import { ChangeEvent, FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseWordExam, DraftQuestionData } from '../utils/docxParser'
import { MCQOption, QuestionPart, ScoringMethod, TrueFalseOption } from '../types'
import MathRenderer from '../components/MathRenderer'

interface DraftQuestion extends DraftQuestionData {}

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
  const [parseNotice, setParseNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)

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

      const notices: string[] = []
      notices.push(`Đã tách được ${result.questions.length} câu hỏi từ file Word.`)
      const needReview = result.questions.filter((q) => q.needsReview).length
      if (needReview > 0) {
        notices.push(
          `${needReview} câu được đánh dấu "⚠ Cần rà lại" bên dưới — do chưa xác định chắc chắn đáp án đúng (ví dụ quên gạch chân Ctrl+U trong Word), hoặc do công thức toán có dấu hiệu bị lỗi khi tách từ file (ngoặc \\left/\\right không khớp, hoặc lẫn dấu ngoặc kép sát công thức). Hãy xem lại khung xem trước của từng câu được đánh dấu trước khi lưu đề.`
        )
      }
      if (result.mathTypeDetected && !result.mathTypeServerConfigured) {
        notices.push(
          `File có chứa công thức chèn bằng công cụ MathType (OLE), nhưng hệ thống chưa cấu hình máy chủ chuyển đổi (VITE_MATHTYPE_SERVER_URL) nên các công thức này KHÔNG hiển thị được. Hãy chuyển các công thức đó sang ảnh trong Word rồi tải lại, hoặc gõ trực tiếp bằng LaTeX trong cặp dấu $...$.`
        )
      } else if (result.mathTypeDetected && result.mathTypeServerConfigured) {
        notices.push(`Đã chuyển đổi ${result.mathTypeConvertedCount} công thức MathType sang LaTeX qua máy chủ đã cấu hình.`)
      }
      setParseNotice(notices.join(' '))
    } catch (err: any) {
      setParseNotice(`Lỗi khi đọc file Word: ${err.message || err}`)
    } finally {
      setParsing(false)
      e.target.value = ''
    }
  }

  function addManualQuestion() {
    setQuestions((prev) => [
      ...prev,
      {
        key: uuid(),
        order_index: prev.length + 1,
        part: 'mcq',
        content_html: 'Nhập nội dung câu hỏi...',
        options: emptyMcq(),
        correct_answer: 'A',
        explanation_html: '',
        points: 0.25,
        needsReview: false,
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
      needsReview: false,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Link to="/teacher/dashboard" className="btn secondary">← Trang chủ giáo viên</Link>
        {questions.length > 0 && (
          <button type="button" className="btn accent" onClick={() => setPreviewMode((v) => !v)}>
            {previewMode ? '✏️ Quay lại chỉnh sửa' : '👁 Xem trước toàn bộ đề'}
          </button>
        )}
      </div>

      {previewMode ? (
        <div className="card">
          <h2>Xem trước toàn bộ đề — kiểm tra công thức có hiển thị đúng không</h2>
          <p style={{ fontSize: 12.5 }}>
            Đây là cách đề sẽ hiển thị cho học sinh. Rà từng câu xem công thức toán, hình ảnh có đúng không trước
            khi lưu. Câu nào có nhãn "⚠ Cần rà lại" bên dưới thì đặc biệt lưu ý.
          </p>
          {questions.map((q, idx) => (
            <div className="question-block" key={q.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>Câu {idx + 1}</b>
                <span>
                  <span className="badge" style={{ marginRight: 6 }}>{q.points} điểm</span>
                  {q.needsReview && <span className="badge warn">⚠ Cần rà lại</span>}
                </span>
              </div>
              <MathRenderer html={q.content_html} block />
              {q.part === 'mcq' && (
                <div>
                  {(q.options as MCQOption[]).map((opt) => (
                    <div className="tf-row" key={opt.key}>
                      <b style={{ color: opt.key === q.correct_answer ? 'var(--success)' : undefined }}>{opt.key}.</b>
                      <MathRenderer html={opt.html} />
                      {opt.key === q.correct_answer && <span className="badge correct" style={{ marginLeft: 'auto' }}>Đáp án đúng</span>}
                    </div>
                  ))}
                </div>
              )}
              {q.part === 'true_false' && (
                <div>
                  {(q.options as TrueFalseOption[]).map((opt) => (
                    <div className="tf-row" key={opt.key}>
                      <b>{opt.key})</b>
                      <MathRenderer html={opt.html} />
                      <span className={`badge ${opt.correct ? 'correct' : 'wrong'}`} style={{ marginLeft: 'auto' }}>
                        {opt.correct ? 'Đúng' : 'Sai'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {q.part === 'short_answer' && (
                <p>Đáp án đúng: <b>{q.correct_answer || '(chưa nhập)'}</b></p>
              )}
              {q.explanation_html && (
                <div className="explanation">
                  <b>Lời giải:</b>
                  <MathRenderer html={q.explanation_html} />
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
      <form onSubmit={handleSave}>
        <div className="card">
          <h2>1. Thiết lập đợt thi</h2>
          <label>Tên đề thi</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Đợt thi số</label>
              <input type="number" min={1} value={waveNumber} onChange={(e) => setWaveNumber(Number(e.target.value))} required />
            </div>
            <div style={{ flex: 1 }}>
              <label>Thời lượng (phút)</label>
              <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Giờ mở cổng thi</label>
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label>Giờ đóng cổng thi</label>
              <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} required />
            </div>
          </div>

          <label>Cách tính điểm câu Đúng/Sai (4 ý)</label>
          <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value as ScoringMethod)}>
            <option value="ministry_partial">Theo Bộ GDĐT: đúng 1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1đ</option>
            <option value="equal_split">Chia đều: điểm câu × (số ý đúng / 4)</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', marginBottom: 0 }}
              checked={requiresPrev}
              onChange={(e) => setRequiresPrev(e.target.checked)}
            />
            Yêu cầu học sinh phải hoàn thành đợt thi trước (đợt #{waveNumber - 1}) mới được thi đợt này.
          </label>
        </div>

        <div className="card">
          <h2>2. Tải đề thi từ file Word</h2>
          <p style={{ fontSize: 13 }}>
            Hệ thống tự tách <b>PHẦN 1 (trắc nghiệm)</b>, <b>PHẦN 2 (đúng/sai)</b>, <b>PHẦN 3 (trả lời ngắn)</b> theo
            tiêu đề trong file, và tự nhận đáp án đúng nếu bạn <b>gạch chân (Ctrl+U)</b> đáp án/ý đúng ngay trong
            Word — không cần soạn lại trên web. Câu trả lời ngắn tự nhận qua dòng "Đáp án: ...". Công thức gõ bằng
            LaTeX (đặt trong <code>$...$</code>) hoặc hình ảnh trong file đều hiển thị chính xác. Xem README mục 8
            về cách xử lý công thức MathType.
          </p>
          <input type="file" accept=".docx" onChange={handleUploadWord} />
          {parsing && <p>Đang xử lý file...</p>}
          {parseNotice && <div className="explanation">{parseNotice}</div>}
          <button type="button" className="btn secondary" onClick={addManualQuestion}>
            + Thêm câu hỏi thủ công
          </button>
        </div>

        <div className="card">
          <h2>3. Biên soạn câu hỏi ({questions.length})</h2>
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

              <label>Nội dung câu hỏi (HTML — có thể chỉnh sửa trực tiếp)</label>
              <textarea rows={4} value={q.content_html} onChange={(e) => updateQuestion(q.key, { content_html: e.target.value })} />
              <div className="card" style={{ background: '#fafbfe' }}>
                <MathRenderer html={q.content_html} block />
              </div>

              <label>Dạng câu hỏi</label>
              <select value={q.part} onChange={(e) => changePart(q.key, e.target.value as QuestionPart)}>
                <option value="mcq">Trắc nghiệm 4 đáp án</option>
                <option value="true_false">Đúng / Sai (4 ý)</option>
                <option value="short_answer">Trả lời ngắn</option>
              </select>

              <label>Điểm câu này</label>
              <input type="number" step={0.05} value={q.points} onChange={(e) => updateQuestion(q.key, { points: Number(e.target.value) })} />

              {q.part === 'mcq' && (
                <>
                  {(q.options as MCQOption[]).map((opt, idx) => (
                    <div key={opt.key} className="tf-row">
                      <b>{opt.key}.</b>
                      <input
                        style={{ marginBottom: 0 }}
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
                  <select value={q.correct_answer} onChange={(e) => updateQuestion(q.key, { correct_answer: e.target.value, needsReview: false })}>
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

              <label>Lời giải chi tiết (hiển thị cho học sinh sau khi nộp bài)</label>
              <textarea rows={3} value={q.explanation_html} onChange={(e) => updateQuestion(q.key, { explanation_html: e.target.value })} />
            </div>
          ))}
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu đề thi'}
        </button>
      </form>
      )}
    </div>
  )
}
