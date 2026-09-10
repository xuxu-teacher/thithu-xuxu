import { useState } from 'react'
import { Question, MCQOption, TrueFalseOption } from '../types'
import { generateSimilarQuestions, SimilarVariant } from '../utils/generateSimilar'
import MathRenderer from './MathRenderer'

export default function SimilarPracticeWidget({
  original,
}: {
  original: Pick<Question, 'part' | 'content_html' | 'options' | 'correct_answer' | 'explanation_html'>
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [variant, setVariant] = useState<SimilarVariant | null>(null)

  const [mcqPick, setMcqPick] = useState<string | null>(null)
  const [tfPick, setTfPick] = useState<Record<string, boolean>>({})
  const [saPick, setSaPick] = useState('')
  const [checked, setChecked] = useState(false)

  async function generate() {
    setLoading(true)
    setError(null)
    setChecked(false)
    setMcqPick(null)
    setTfPick({})
    setSaPick('')
    try {
      const [v] = await generateSimilarQuestions([original])
      setVariant(v)
    } catch (err: any) {
      setError(err.message || 'Không tạo được câu tương tự, thử lại sau.')
    } finally {
      setLoading(false)
    }
  }

  if (!variant) {
    return (
      <button type="button" className="btn secondary" onClick={generate} disabled={loading} style={{ marginTop: 8 }}>
        {loading ? 'Đang tạo câu tương tự...' : '🔁 Luyện câu tương tự (đổi số)'}
      </button>
    )
  }

  const isCorrectMcq = mcqPick === variant.correct_answer
  const isCorrectSa = saPick.trim().toLowerCase() === (variant.correct_answer || '').trim().toLowerCase()

  return (
    <div className="card" style={{ background: '#f5f8ff', marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 13 }}>🔁 Câu luyện tương tự</b>
        <button type="button" className="btn secondary" style={{ padding: '4px 10px' }} onClick={generate} disabled={loading}>
          {loading ? 'Đang tạo...' : 'Tạo câu khác'}
        </button>
      </div>

      {!variant.changed_numbers && (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Câu này không có số liệu để đổi (câu lý thuyết) — hiển thị lại nguyên câu gốc.
        </p>
      )}

      <MathRenderer html={variant.content_html} />

      {original.part === 'mcq' && (
        <div>
          {(variant.options as MCQOption[]).map((opt) => {
            const picked = mcqPick === opt.key
            const showRight = checked && opt.key === variant.correct_answer
            const showWrong = checked && picked && opt.key !== variant.correct_answer
            return (
              <div
                key={opt.key}
                className="tf-row"
                style={{ cursor: checked ? 'default' : 'pointer', background: showRight ? '#dcfce7' : showWrong ? '#fee2e2' : picked ? '#e0e7ff' : undefined }}
                onClick={() => !checked && setMcqPick(opt.key)}
              >
                <b>{opt.key}.</b> <MathRenderer html={opt.html} />
              </div>
            )
          })}
          <button type="button" className="btn" disabled={!mcqPick || checked} onClick={() => setChecked(true)}>
            Kiểm tra
          </button>
          {checked && <span className={`badge ${isCorrectMcq ? 'correct' : 'wrong'}`} style={{ marginLeft: 8 }}>{isCorrectMcq ? '✓ Đúng' : `✗ Sai — đáp án đúng: ${variant.correct_answer}`}</span>}
        </div>
      )}

      {original.part === 'true_false' && (
        <div>
          {(variant.options as TrueFalseOption[]).map((opt) => (
            <div key={opt.key} className="tf-row">
              <b>{opt.key})</b> <MathRenderer html={opt.html} />
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn ${tfPick[opt.key] === true ? '' : 'secondary'}`}
                  style={{ padding: '4px 10px' }}
                  disabled={checked}
                  onClick={() => setTfPick((p) => ({ ...p, [opt.key]: true }))}
                >
                  Đúng
                </button>
                <button
                  type="button"
                  className={`btn ${tfPick[opt.key] === false ? '' : 'secondary'}`}
                  style={{ padding: '4px 10px' }}
                  disabled={checked}
                  onClick={() => setTfPick((p) => ({ ...p, [opt.key]: false }))}
                >
                  Sai
                </button>
                {checked && (
                  <span className={`badge ${tfPick[opt.key] === opt.correct ? 'correct' : 'wrong'}`}>
                    {tfPick[opt.key] === opt.correct ? '✓' : `✗ (đúng: ${opt.correct ? 'Đúng' : 'Sai'})`}
                  </span>
                )}
              </div>
            </div>
          ))}
          <button type="button" className="btn" disabled={checked} onClick={() => setChecked(true)}>
            Kiểm tra
          </button>
        </div>
      )}

      {original.part === 'short_answer' && (
        <div>
          <input value={saPick} onChange={(e) => setSaPick(e.target.value)} disabled={checked} placeholder="Nhập đáp số" style={{ maxWidth: 220 }} />
          <button type="button" className="btn" disabled={!saPick || checked} onClick={() => setChecked(true)}>
            Kiểm tra
          </button>
          {checked && <span className={`badge ${isCorrectSa ? 'correct' : 'wrong'}`} style={{ marginLeft: 8 }}>{isCorrectSa ? '✓ Đúng' : `✗ Sai — đáp án đúng: ${variant.correct_answer}`}</span>}
        </div>
      )}

      {checked && variant.explanation_html && (
        <div className="explanation">
          <b>Lời giải:</b>
          <MathRenderer html={variant.explanation_html} />
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
        ⚠️ Câu này do AI tạo tự động — nếu thấy đáp án vô lý, báo lại cho giáo viên.
      </p>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
    </div>
  )
}
