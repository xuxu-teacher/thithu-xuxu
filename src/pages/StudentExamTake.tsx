import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Question, StudentAnswer, TrueFalseOption, MCQOption } from '../types'
import MathRenderer from '../components/MathRenderer'

export default function StudentExamTake() {
  const { examId } = useParams()
  const { student } = useAuth()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const submittedRef = useRef(false)
  const tabSwitchRef = useRef(0)

  useEffect(() => {
    async function init() {
      const { data: startErr } = await supabase.rpc('start_attempt', {
        p_exam_id: examId,
        p_student_id: student!.id,
      })
      if (startErr) {
        setError(startErr)
        setLoading(false)
        return
      }

      const { data: examInfo } = await supabase
        .rpc('get_exam_info', { p_exam_id: examId })
        .single()
      const { data: qs } = await supabase.rpc('get_exam_questions', {
        p_exam_id: examId,
        p_student_id: student!.id,
      })
      const { data: attempt } = await supabase
        .rpc('get_my_attempt', { p_exam_id: examId, p_student_id: student!.id })
        .single()

      setQuestions((qs as Question[]) || [])
      setAnswers(((attempt as any)?.answers as Record<string, StudentAnswer>) || {})

      const close = new Date((examInfo as any).close_at).getTime()
      const durationEnd = Date.now() + (examInfo as any).duration_minutes * 60_000
      const deadline = Math.min(close, durationEnd)
      setSecondsLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)))
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  // Phát hiện dấu hiệu gian lận: đếm số lần học sinh rời khỏi tab/thu nhỏ
  // cửa sổ trong lúc làm bài (mở tài liệu, tra Google ở tab khác...). Ghi
  // nhận ngay lập tức lên server để không mất dữ liệu nếu đóng trình duyệt.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden && !submittedRef.current) {
        tabSwitchRef.current += 1
        setTabSwitchCount(tabSwitchRef.current)
        supabase.rpc('report_tab_switch', {
          p_exam_id: examId,
          p_student_id: student!.id,
          p_count: tabSwitchRef.current,
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  useEffect(() => {
    if (secondsLeft === null) return
    if (secondsLeft <= 0) {
      handleSubmit()
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft])

  function setAnswer(qid: string, value: StudentAnswer) {
    setAnswers((prev) => ({ ...prev, [qid]: value }))
  }

  async function handleSubmit() {
    if (submittedRef.current) return
    submittedRef.current = true
    // QUAN TRỌNG: điểm được tính TẠI SERVER (hàm submit_attempt trong Supabase)
    // dựa trên đáp án thật trong bảng questions — KHÔNG tự chấm ở client, vì
    // trong lúc làm bài client chỉ nhận đề đã ẩn đáp án (chống lộ đề qua
    // devtools), nên client không có đủ dữ liệu để tự chấm chính xác.
    await supabase.rpc('submit_attempt', {
      p_exam_id: examId,
      p_student_id: student!.id,
      p_answers: answers,
      p_tab_switch_count: tabSwitchRef.current,
    })
    navigate(`/student/exams/${examId}/result`)
  }

  if (loading) return <div className="container">Đang tải đề thi...</div>
  if (error)
    return (
      <div className="container">
        <div className="card">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
        </div>
      </div>
    )

  const mm = Math.floor((secondsLeft || 0) / 60)
  const ss = (secondsLeft || 0) % 60
  const isUrgent = (secondsLeft || 0) < 300

  return (
    <div className="container">
      <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <b>Đang làm bài</b>
          <span className={`timer ${isUrgent ? 'urgent' : ''}`}>
            ⏱ {mm.toString().padStart(2, '0')}:{ss.toString().padStart(2, '0')}
          </span>
        </div>
        {tabSwitchCount > 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: '6px 0 0' }}>
            ⚠ Hệ thống ghi nhận bạn đã rời khỏi màn hình làm bài {tabSwitchCount} lần. Vui lòng ở lại đúng
            trang này cho đến khi nộp bài.
          </p>
        )}
      </div>

      {questions.map((q, idx) => (
        <div className="question-block" key={q.id}>
          <b>Câu {idx + 1}</b> <span className="badge">{q.points} điểm</span>
          <MathRenderer html={q.content_html} />

          {q.part === 'mcq' && (
            <div>
              {(q.options as MCQOption[]).map((opt) => (
                <label key={opt.key} className="tf-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="radio"
                    style={{ width: 'auto', marginBottom: 0 }}
                    name={q.id}
                    checked={answers[q.id] === opt.key}
                    onChange={() => setAnswer(q.id, opt.key)}
                  />
                  <b>{opt.key}.</b> <MathRenderer html={opt.html} />
                </label>
              ))}
            </div>
          )}

          {q.part === 'true_false' && (
            <div>
              {(q.options as TrueFalseOption[]).map((opt) => {
                const current = (answers[q.id] as Record<string, boolean>) || {}
                return (
                  <div className="tf-row" key={opt.key}>
                    <b>{opt.key})</b>
                    <MathRenderer html={opt.html} className="" />
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                      <label style={{ margin: 0 }}>
                        <input
                          type="radio"
                          style={{ width: 'auto' }}
                          name={`${q.id}-${opt.key}`}
                          checked={current[opt.key] === true}
                          onChange={() =>
                            setAnswer(q.id, { ...current, [opt.key]: true })
                          }
                        />{' '}
                        Đúng
                      </label>
                      <label style={{ margin: 0 }}>
                        <input
                          type="radio"
                          style={{ width: 'auto' }}
                          name={`${q.id}-${opt.key}`}
                          checked={current[opt.key] === false}
                          onChange={() =>
                            setAnswer(q.id, { ...current, [opt.key]: false })
                          }
                        />{' '}
                        Sai
                      </label>
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {q.part === 'short_answer' && (
            <input
              value={(answers[q.id] as string) || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="Nhập câu trả lời..."
            />
          )}
        </div>
      ))}

      <button className="btn" onClick={handleSubmit}>
        Nộp bài
      </button>
    </div>
  )
}
