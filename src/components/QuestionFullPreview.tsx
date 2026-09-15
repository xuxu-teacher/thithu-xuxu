import { MCQOption, TrueFalseOption, QuestionPart } from '../types'
import MathRenderer from './MathRenderer'

interface PreviewQuestion {
  content_html: string
  part: QuestionPart
  options: MCQOption[] | TrueFalseOption[] | null
  correct_answer?: string | null
  explanation_html?: string | null
}

/** Xem đầy đủ 1 câu hỏi giống hệt cách hiển thị thật: đề — phương án — đáp án đúng (tô màu) — lời giải. */
export default function QuestionFullPreview({ question }: { question: PreviewQuestion }) {
  return (
    <div className="card" style={{ background: '#fafbfe' }}>
      <MathRenderer html={question.content_html} block />

      {question.part === 'mcq' && (
        <div>
          {(question.options as MCQOption[] | null)?.map((opt) => (
            <div
              key={opt.key}
              className="tf-row"
              style={{ background: opt.key === question.correct_answer ? '#dcfce7' : undefined }}
            >
              <b>{opt.key}.</b> <MathRenderer html={opt.html} />
              {opt.key === question.correct_answer && <span className="badge correct" style={{ marginLeft: 'auto' }}>✓ Đáp án đúng</span>}
            </div>
          ))}
        </div>
      )}

      {question.part === 'true_false' && (
        <div>
          {(question.options as TrueFalseOption[] | null)?.map((opt) => (
            <div key={opt.key} className="tf-row" style={{ background: opt.correct ? '#dcfce7' : '#fee2e2' }}>
              <b>{opt.key})</b> <MathRenderer html={opt.html} />
              <span className={`badge ${opt.correct ? 'correct' : 'wrong'}`} style={{ marginLeft: 'auto' }}>
                {opt.correct ? 'Đúng' : 'Sai'}
              </span>
            </div>
          ))}
        </div>
      )}

      {question.part === 'short_answer' && (
        <p>
          <b>Đáp án đúng:</b> {question.correct_answer || '(chưa có)'}
        </p>
      )}

      {question.explanation_html && (
        <div className="explanation">
          <b>Lời giải chi tiết:</b>
          <MathRenderer html={question.explanation_html} />
        </div>
      )}
    </div>
  )
}
