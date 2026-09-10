import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Question, ScoringMethod, StudentAnswer, MCQOption, TrueFalseOption } from '../types'
import { scoreQuestion } from '../utils/scoring'
import MathRenderer from '../components/MathRenderer'
import SimilarPracticeWidget from '../components/SimilarPracticeWidget'

export default function StudentResult() {
  const { examId } = useParams()
  const { student } = useAuth()
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [score, setScore] = useState<number | null>(null)
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('ministry_partial')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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
      setScore((attempt as any)?.score ?? null)
      setLoading(false)
    }
    load()
  }, [examId, student])

  if (loading) return <div className="container">Đang tải...</div>

  return (
    <div className="container">
      <div className="card">
        <h2>Kết quả bài thi</h2>
        <p style={{ fontSize: 22 }}>
          Điểm của bạn: <b>{score ?? '-'}</b>
        </p>
        <button className="btn secondary no-print" onClick={() => window.print()}>
          🖨️ In / Tải đề này để luyện lại
        </button>
      </div>

      {questions.map((q, idx) => {
        const ans = answers[q.id]
        const got = scoreQuestion(q, ans, scoringMethod)
        const isFullMark = got >= q.points - 1e-9
        const isZero = got <= 1e-9
        // Câu Đúng/Sai chấm điểm từng phần — không nên tô đỏ tuyệt đối khi
        // học sinh đã đúng một phần (ví dụ 3/4 ý đúng = 0.5đ, không phải "sai").
        const badgeClass = isFullMark ? 'correct' : isZero ? 'wrong' : 'warn'

        return (
          <div className="question-block" key={q.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>Câu {idx + 1}</b>
              <span className={`badge ${badgeClass}`}>
                {got}/{q.points} điểm
              </span>
            </div>
            <MathRenderer html={q.content_html} />

            {q.part === 'mcq' && (
              <div>
                {(q.options as MCQOption[]).map((opt) => (
                  <div
                    key={opt.key}
                    className="tf-row"
                    style={{
                      background:
                        opt.key === q.correct_answer
                          ? '#dcfce7'
                          : opt.key === ans
                          ? '#fee2e2'
                          : undefined,
                    }}
                  >
                    <b>{opt.key}.</b> <MathRenderer html={opt.html} />
                    {opt.key === ans && <span className="badge">Bạn chọn</span>}
                    {opt.key === q.correct_answer && <span className="badge correct">Đáp án đúng</span>}
                  </div>
                ))}
              </div>
            )}

            {q.part === 'true_false' && (
              <div>
                {(q.options as TrueFalseOption[]).map((opt) => {
                  const current = (ans as Record<string, boolean>) || {}
                  const studentChoice = current[opt.key]
                  const correctChoice = opt.correct
                  const isRight = studentChoice === correctChoice
                  return (
                    <div key={opt.key} className="tf-row">
                      <b>{opt.key})</b> <MathRenderer html={opt.html} />
                      <span style={{ marginLeft: 'auto' }}>
                        Bạn chọn: <b>{studentChoice === undefined ? '(bỏ trống)' : studentChoice ? 'Đúng' : 'Sai'}</b>{' '}
                        · Đáp án: <b>{correctChoice ? 'Đúng' : 'Sai'}</b>{' '}
                        <span className={`badge ${isRight ? 'correct' : 'wrong'}`}>
                          {isRight ? '✓' : '✗'}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {q.part === 'short_answer' && (
              <p>
                Bạn trả lời: <b>{(ans as string) || '(bỏ trống)'}</b> · Đáp án đúng:{' '}
                <b>{q.correct_answer}</b>
              </p>
            )}

            {q.explanation_html && (
              <div className="explanation">
                <b>Lời giải chi tiết:</b>
                <MathRenderer html={q.explanation_html} />
              </div>
            )}

            <SimilarPracticeWidget original={q} />
          </div>
        )
      })}
    </div>
  )
}
