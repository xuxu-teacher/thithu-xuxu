import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { supabase } from '../lib/supabaseClient'
import { parseWordExam, DraftQuestionData } from '../utils/docxParser'
import { handlePasteImage, fileToImgTag } from '../utils/imagePaste'
import { Exam, MCQOption, Question, QuestionPart, ScoringMethod, TrueFalseOption } from '../types'
import MathRenderer from '../components/MathRenderer'

interface DraftQuestion extends DraftQuestionData {
  dbId: string | null // id thật trong bảng questions nếu là câu đã có sẵn — null nếu là câu mới thêm khi sửa
}

function emptyMcq(): MCQOption[] {
  return ['A', 'B', 'C', 'D'].map((k) => ({ key: k, html: '' }))
}
function emptyTF(): TrueFalseOption[] {
  return ['a', 'b', 'c', 'd'].map((k) => ({ key: k, html: '', correct: false }))
}

function questionToDraft(q: Question, index: number): DraftQuestion {
  return {
    key: uuid(),
    dbId: q.id,
    order_index: index + 1,
    part: q.part,
    content_html: q.content_html,
    options: (q.options as MCQOption[] | TrueFalseOption[]) || (q.part === 'mcq' ? emptyMcq() : q.part === 'true_false' ? emptyTF() : []),
    correct_answer: q.correct_answer || '',
    explanation_html: q.explanation_html || '',
    points: Number(q.points),
    needsReview: false,
  }
}

export default function TeacherExamEdit() {
  const { examId } = useParams()
  const navigate = useNavigate()

  const [exam, setExam] = useState<Exam | null>(null)
  const [title, setTitle] = useState('')
  const [waveNumber, setWaveNumber] = useState(1)
  const [duration, setDuration] = useState(90)
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('ministry_partial')
  const [requiresPrev, setRequiresPrev] = useState(true)
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [parsing, setParsing] = useState(false)
  const [parseNotice, setParseNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [scrollToKey, setScrollToKey] = useState<string | null>(null)

  useEffect(() => {
    if (!previewMode && scrollToKey) {
      const el = document.getElementById(`q-edit-${scrollToKey}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.boxShadow = '0 0 0 3px var(--accent)'
        setTimeout(() => { el.style.boxShadow = '' }, 1800)
      }
      setScrollToKey(null)
    }
  }, [previewMode, scrollToKey])

  function jumpToEdit(key: string) {
    setScrollToKey(key)
    setPreviewMode(false)
  }

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from('exams').select('*').eq('id', examId).single()
      const { data: qs } = await supabase.from('questions').select('*').eq('exam_id', examId).order('order_index')
      if (e) {
        setExam(e as Exam)
        setTitle((e as Exam).title)
        setWaveNumber((e as Exam).wave_number)
        setDuration((e as Exam).duration_minutes)
        setScoringMethod((e as Exam).scoring_method)
        setRequiresPrev((e as Exam).requires_previous_wave)
      }
      setQuestions(((qs as Question[]) || []).map(questionToDraft))
      setLoading(false)
    }
    load()
  }, [examId])

  async function handleUploadWord(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setParseNotice(null)
    try {
      const result = await parseWordExam(file)
      setQuestions((prev) => [
        ...prev,
        ...result.questions.map((q, i) => ({ ...q, key: uuid(), dbId: null, order_index: prev.length + i + 1 })),
      ])
      const notices: string[] = [`Đã thêm ${result.questions.length} câu hỏi mới từ file Word vào cuối đề.`]
      const needReview = result.questions.filter((q) => q.needsReview).length
      if (needReview > 0) notices.push(`${needReview} câu cần rà lại đáp án/công thức — xem nhãn "⚠" bên dưới.`)
      setParseNotice(notices.join(' '))
      setPreviewMode(true)
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
        dbId: null,
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
    const q = questions.find((x) => x.key === key)
    if (q?.dbId) setDeletedIds((prev) => [...prev, q.dbId as string])
    setQuestions((prev) => prev.filter((x) => x.key !== key))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (questions.length === 0) return setError('Đề thi cần ít nhất 1 câu hỏi.')
    setSaving(true)
    try {
      const { error: examErr } = await supabase
        .from('exams')
        .update({
          title,
          wave_number: waveNumber,
          duration_minutes: duration,
          scoring_method: scoringMethod,
          requires_previous_wave: requiresPrev,
        })
        .eq('id', examId)
      if (examErr) throw examErr

      // Xóa các câu đã bị bỏ khỏi danh sách
      if (deletedIds.length > 0) {
        const { error: delErr } = await supabase.from('questions').delete().in('id', deletedIds)
        if (delErr) throw delErr
      }

      // Cập nhật các câu đã có sẵn (giữ nguyên id) — để không phá vỡ dữ liệu
      // bài làm học sinh đã nộp trước đó (answers lưu theo question id).
      const existing = questions.filter((q) => q.dbId)
      for (let i = 0; i < existing.length; i++) {
        const q = existing[i]
        const { error: updErr } = await supabase
          .from('questions')
          .update({
            order_index: questions.indexOf(q) + 1,
            part: q.part,
            content_html: q.content_html,
            options: q.part === 'short_answer' ? null : q.options,
            correct_answer: q.part === 'true_false' ? null : q.correct_answer,
            explanation_html: q.explanation_html,
            points: q.points,
          })
          .eq('id', q.dbId)
        if (updErr) throw updErr
      }

      // Thêm các câu mới (chưa có id thật)
      const newOnes = questions.filter((q) => !q.dbId)
      if (newOnes.length > 0) {
        const rows = newOnes.map((q) => ({
          exam_id: examId,
          order_index: questions.indexOf(q) + 1,
          part: q.part,
          content_html: q.content_html,
          options: q.part === 'short_answer' ? null : q.options,
          correct_answer: q.part === 'true_false' ? null : q.correct_answer,
          explanation_html: q.explanation_html,
          points: q.points,
        }))
        const { error: insErr } = await supabase.from('questions').insert(rows)
        if (insErr) throw insErr
      }

      navigate(`/teacher/exams/${examId}/results`)
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi lưu đề thi.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="container">Đang tải...</div>
  if (!exam) return <div className="container">Không tìm thấy đề thi.</div>

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Link to={`/teacher/exams/${examId}/results`} className="btn secondary">← Về trang kết quả</Link>
        {questions.length > 0 && (
          <button type="button" className="btn accent" onClick={() => setPreviewMode((v) => !v)}>
            {previewMode ? '✏️ Quay lại chỉnh sửa' : '👁 Xem trước toàn bộ đề'}
          </button>
        )}
      </div>

      <div className="card" style={{ background: 'var(--warn-light)', borderColor: '#fde68a' }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          ⚠️ Đề thi này đang (hoặc đã) mở cho học sinh. Sửa nội dung câu hỏi/đáp án ở đây sẽ ảnh hưởng ngay cho học
          sinh CHƯA làm bài. Với học sinh ĐÃ nộp bài trước đó, điểm số đã chấm sẽ KHÔNG tự động tính lại — chỉ có
          nội dung hiển thị khi họ xem lại bài là được cập nhật theo bản mới.
        </p>
      </div>

      {previewMode ? (
        <div className="card">
          <h2>Xem trước toàn bộ đề</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" style={{ width: 'auto', marginBottom: 0 }} checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
            Chỉ hiện các câu "⚠ Cần rà lại" ({questions.filter((q) => q.needsReview).length} câu)
          </label>
          {questions
            .filter((q) => !onlyFlagged || q.needsReview)
            .map((q) => {
              const idx = questions.indexOf(q)
              return (
                <div className="question-block" key={q.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>Câu {idx + 1}</b>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="badge">{q.points} điểm</span>
                      {q.needsReview && <span className="badge warn">⚠ Cần rà lại</span>}
                      <button type="button" className="btn secondary" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => jumpToEdit(q.key)}>
                        ✏️ Sửa câu này
                      </button>
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
                  {q.part === 'short_answer' && <p>Đáp án đúng: <b>{q.correct_answer || '(chưa nhập)'}</b></p>}
                  {q.explanation_html && (
                    <div className="explanation">
                      <b>Lời giải:</b>
                      <MathRenderer html={q.explanation_html} />
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <form onSubmit={handleSave}>
          <div className="card">
            <h2>Thiết lập đề thi</h2>
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
            <label>Cách tính điểm câu Đúng/Sai (4 ý)</label>
            <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value as ScoringMethod)}>
              <option value="ministry_partial">Theo Bộ GDĐT: đúng 1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1đ</option>
              <option value="equal_split">Chia đều: điểm câu × (số ý đúng / 4)</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" style={{ width: 'auto', marginBottom: 0 }} checked={requiresPrev} onChange={(e) => setRequiresPrev(e.target.checked)} />
              Yêu cầu học sinh phải hoàn thành đợt thi trước mới được thi đợt này.
            </label>
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Muốn đổi giờ mở/đóng cổng thi? Vào trang "Kết quả" của đề này để chỉnh (có thể đổi bất cứ lúc nào).
            </p>
          </div>

          <div className="card">
            <h2>Thêm câu hỏi mới từ file Word (tùy chọn)</h2>
            <input type="file" accept=".docx" onChange={handleUploadWord} />
            {parsing && <p>Đang xử lý file...</p>}
            {parseNotice && <div className="explanation">{parseNotice}</div>}
            <button type="button" className="btn secondary" onClick={addManualQuestion}>
              + Thêm câu hỏi thủ công
            </button>
          </div>

          <div className="card">
            <h2>Câu hỏi ({questions.length})</h2>
            {questions.map((q) => (
              <div className="question-block" id={`q-edit-${q.key}`} key={q.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>Câu {questions.indexOf(q) + 1}</b>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {!q.dbId && <span className="badge pink">Câu mới</span>}
                    {q.needsReview && <span className="badge warn">⚠ Cần rà lại</span>}
                    <button type="button" className="btn danger" onClick={() => removeQuestion(q.key)}>Xóa</button>
                  </div>
                </div>

                <label>Nội dung câu hỏi (HTML — có thể chỉnh sửa trực tiếp)</label>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
                  💡 Đề bị lỗi công thức/hình vẽ? Dán trực tiếp ảnh (Ctrl+V) vào ô bên dưới, hoặc bấm "📷 Chèn
                  ảnh" để chọn file.
                </p>
                <textarea
                  rows={4}
                  value={q.content_html}
                  onChange={(e) => updateQuestion(q.key, { content_html: e.target.value })}
                  onPaste={(e) => handlePasteImage(e, (img) => updateQuestion(q.key, { content_html: q.content_html + img }))}
                />
                <label className="btn secondary" style={{ display: 'inline-flex', cursor: 'pointer', marginBottom: 12 }}>
                  📷 Chèn ảnh vào câu hỏi
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

                <label>Lời giải chi tiết</label>
                <textarea
                  rows={3}
                  value={q.explanation_html}
                  onChange={(e) => updateQuestion(q.key, { explanation_html: e.target.value })}
                  onPaste={(e) => handlePasteImage(e, (img) => updateQuestion(q.key, { explanation_html: q.explanation_html + img }))}
                />
                <label className="btn secondary" style={{ display: 'inline-flex', cursor: 'pointer' }}>
                  📷 Chèn ảnh vào lời giải
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const img = await fileToImgTag(file)
                      updateQuestion(q.key, { explanation_html: q.explanation_html + img })
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            ))}
          </div>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </form>
      )}
    </div>
  )
}
