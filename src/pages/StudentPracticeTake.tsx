import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { PracticeQuestion, MCQOption, TrueFalseOption, StudentAnswer, Question } from '../types'
import { scoreQuestion } from '../utils/scoring'
import MathRenderer from '../components/MathRenderer'

export default function StudentPracticeTake() {
  const { practiceExamId } = useParams()
  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_practice_exam_questions', { p_practice_exam_id: practiceExamId })
      setQuestions((data as PracticeQuestion[]) || [])
      setLoading(false)
    }
    load()
  }, [practiceExamId])

  function resetAttempt() {
    setAnswers({})
    setChecked(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading) return <div className="container">Đang tải...</div>

  // scoreQuestion nhận type Question — practice_questions có đúng các trường
  // cần thiết nên ép kiểu trực tiếp, không cần map field.
  const asQuestion = (q: PracticeQuestion) => q as unknown as Question

  const total = questions.reduce((s, q) => s + Number(q.points), 0)
  const got = checked ? questions.reduce((s, q) => s + scoreQuestion(asQuestion(q), answers[q.id], 'ministry_partial'), 0) : 0

  return (
    <div className="container">
      <Link to="/student/practice" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Danh sách đề thi thử
      </Link>

      {checked && (
        <div className="card" style={{ background: '#f5f8ff' }}>
          <h2>Kết quả (tự chấm)</h2>
          <p style={{ fontSize: 22 }}>
            Điểm: <b>{Math.round(got * 100) / 100}</b> / {total}
          </p>
          <button className="btn" onClick={resetAttempt}>
            🔁 Làm lại từ đầu
          </button>
        </div>
      )}

      {questions.map((q, idx) => {
        const ans = answers[q.id]
        const gotQ = checked ? scoreQuestion(asQuestion(q), ans, 'ministry_partial') : 0

        return (
          <div className="question-block" key={q.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>Câu {idx + 1}</b>
              {checked && (
                <span className={`badge ${gotQ >= q.points - 1e-9 ? 'correct' : gotQ <= 1e-9 ? 'wrong' : 'warn'}`}>
                  {Math.round(gotQ * 100) / 100}/{q.points} điểm
                </span>
              )}
            </div>
            <MathRenderer html={q.content_html} />

            {q.part === 'mcq' && (
              <div>
                {(q.options as MCQOption[]).map((opt) => {
                  const picked = ans === opt.key
                  const showRight = checked && opt.key === q.correct_answer
                  const showWrong = checked && picked && opt.key !== q.correct_answer
                  return (
                    <div
                      key={opt.key}
                      className="tf-row"
                      style={{
                        cursor: checked ? 'default' : 'pointer',
                        background: showRight ? '#dcfce7' : showWrong ? '#fee2e2' : picked ? '#e0e7ff' : undefined,
                      }}
                      onClick={() => !checked && setAnswers((p) => ({ ...p, [q.id]: opt.key }))}
                    >
                      <b>{opt.key}.</b> <MathRenderer html={opt.html} />
                    </div>
                  )
                })}
              </div>
            )}

            {q.part === 'true_false' && (
              <div>
                {(q.options as TrueFalseOption[]).map((opt) => {
                  const current = (ans as Record<string, boolean>) || {}
                  return (
                    <div key={opt.key} className="tf-row">
                      <b>{opt.key})</b> <MathRenderer html={opt.html} />
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className={`btn ${current[opt.key] === true ? '' : 'secondary'}`}
                          style={{ padding: '4px 10px' }}
                          disabled={checked}
                          onClick={() => setAnswers((p) => ({ ...p, [q.id]: { ...current, [opt.key]: true } }))}
                        >
                          Đúng
                        </button>
                        <button
                          type="button"
                          className={`btn ${current[opt.key] === false ? '' : 'secondary'}`}
                          style={{ padding: '4px 10px' }}
                          disabled={checked}
                          onClick={() => setAnswers((p) => ({ ...p, [q.id]: { ...current, [opt.key]: false } }))}
                        >
                          Sai
                        </button>
                        {checked && (
                          <span className={`badge ${current[opt.key] === opt.correct ? 'correct' : 'wrong'}`}>
                            {current[opt.key] === opt.correct ? '✓' : `✗ (đúng: ${opt.correct ? 'Đúng' : 'Sai'})`}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {q.part === 'short_answer' && (
              <div>
                <input
                  value={(ans as string) || ''}
                  disabled={checked}
                  onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                  placeholder="Nhập đáp số"
                  style={{ maxWidth: 220 }}
                />
                {checked && (
                  <span style={{ marginLeft: 8 }}>
                    Đáp án đúng: <b>{q.correct_answer}</b>
                  </span>
                )}
              </div>
            )}

            {checked && q.explanation_html && (
              <div className="explanation">
                <b>Lời giải chi tiết:</b>
                <MathRenderer html={q.explanation_html} />
              </div>
            )}
          </div>
        )
      })}

      {!checked && questions.length > 0 && (
        <button className="btn" onClick={() => { setChecked(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>
          Nộp bài & xem điểm
        </button>
      )}
    </div>
  )
}
