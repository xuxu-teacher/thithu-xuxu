import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Question, ScoringMethod, StudentAnswer, TrueFalseOption, MCQOption } from '../types'
import { scoreExam } from '../utils/scoring'
import MathRenderer from '../components/MathRenderer'

export default function StudentExamTake() {
  const { examId } = useParams()
  const { student } = useAuth()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('ministry_partial')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const submittedRef = useRef(false)

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

      setScoringMethod(((examInfo as any)?.scoring_method as ScoringMethod) || 'ministry_partial')
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
    const { total } = scoreExam(questions, answers, scoringMethod)
    await supabase.rpc('submit_attempt', {
      p_exam_id: examId,
      p_student_id: student!.id,
      p_answers: answers,
      p_score: total,
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

  return (
    <div className="container">
      <div className="card" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <b>Đang làm bài</b>
          <span className="timer">
            ⏱ {mm.toString().padStart(2, '0')}:{ss.toString().padStart(2, '0')}
          </span>
        </div>
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
