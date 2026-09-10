import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listBankQuestions, deleteBankQuestion } from '../utils/questionBank'
import { getCurriculumTopics } from '../data/curriculumTopics'
import { QuestionBankItem, QuestionDifficulty, QuestionPart } from '../types'
import MathRenderer from './MathRenderer'

const DIFFICULTIES: QuestionDifficulty[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']
const PARTS: { value: QuestionPart; label: string }[] = [
  { value: 'mcq', label: 'Trắc nghiệm' },
  { value: 'true_false', label: 'Đúng/Sai' },
  { value: 'short_answer', label: 'Trả lời ngắn' },
]

export default function QuestionBankBrowser() {
  const { teacher } = useAuth()
  const [items, setItems] = useState<QuestionBankItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const [gradeFilter, setGradeFilter] = useState<'all' | '10' | '11' | '12'>('all')
  const [topicFilter, setTopicFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | QuestionDifficulty>('all')
  const [partFilter, setPartFilter] = useState<'all' | QuestionPart>('all')

  async function reload() {
    setLoading(true)
    const data = await listBankQuestions(teacher!.id)
    setItems(data)
    setLoading(false)
  }

  useEffect(() => {
    if (teacher && expanded) reload()
  }, [teacher, expanded])

  const topicOptions = gradeFilter === 'all' ? [] : getCurriculumTopics(gradeFilter)

  const filtered = useMemo(() => {
    return items.filter((q) => {
      if (gradeFilter !== 'all' && q.grade !== gradeFilter) return false
      if (topicFilter !== 'all' && q.topic !== topicFilter) return false
      if (difficultyFilter !== 'all' && q.difficulty !== difficultyFilter) return false
      if (partFilter !== 'all' && q.part !== partFilter) return false
      return true
    })
  }, [items, gradeFilter, topicFilter, difficultyFilter, partFilter])

  // Tổng số câu theo từng khối — hiển thị nhanh ngay cả khi chưa lọc gì, để
  // giáo viên biết kho đang có bao nhiêu câu mỗi khối.
  const countByGrade = useMemo(() => {
    const map: Record<string, number> = { '10': 0, '11': 0, '12': 0 }
    for (const q of items) map[q.grade] = (map[q.grade] || 0) + 1
    return map
  }, [items])

  async function handleDelete(id: string) {
    if (!confirm('Xóa câu này khỏi kho câu hỏi? Không thể hoàn tác.')) return
    await deleteBankQuestion(id)
    setItems((prev) => prev.filter((q) => q.id !== id))
  }

  return (
    <div className="card">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <h2 style={{ margin: 0 }}>📊 Kho câu hỏi hiện có {expanded ? '▲' : '▼'}</h2>
        {!expanded && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Bấm để xem/lọc/xóa</span>}
      </div>

      {expanded && (
        <>
          {loading ? (
            <p>Đang tải...</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Tổng {items.length} câu — Khối 10: {countByGrade['10']} · Khối 11: {countByGrade['11']} · Khối 12:{' '}
                {countByGrade['12']}
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 110 }}>
                  <label>Khối</label>
                  <select
                    value={gradeFilter}
                    onChange={(e) => {
                      setGradeFilter(e.target.value as any)
                      setTopicFilter('all')
                    }}
                  >
                    <option value="all">Tất cả</option>
                    <option value="10">Khối 10</option>
                    <option value="11">Khối 11</option>
                    <option value="12">Khối 12</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label>Chủ đề</label>
                  <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} disabled={gradeFilter === 'all'}>
                    <option value="all">Tất cả</option>
                    {topicOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: 160 }}>
                  <label>Mức độ</label>
                  <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value as any)}>
                    <option value="all">Tất cả</option>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ minWidth: 140 }}>
                  <label>Dạng</label>
                  <select value={partFilter} onChange={(e) => setPartFilter(e.target.value as any)}>
                    <option value="all">Tất cả</option>
                    {PARTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                Hiện {filtered.length} câu khớp bộ lọc.
              </p>

              {filtered.map((q) => (
                <div className="question-block" key={q.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="badge">Khối {q.grade}</span>
                      <span className="badge">{q.topic}</span>
                      <span className="badge">{q.difficulty}</span>
                      <span className="badge">{PARTS.find((p) => p.value === q.part)?.label}</span>
                      {q.needs_review && <span className="badge warn">⚠ Cần rà lại</span>}
                    </div>
                    <button type="button" className="btn danger" style={{ padding: '4px 10px' }} onClick={() => handleDelete(q.id)}>
                      Xóa
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0' }}>Nguồn: {q.source_file || '—'}</p>
                  <MathRenderer html={q.content_html} />
                </div>
              ))}

              {filtered.length === 0 && <p style={{ color: 'var(--muted)' }}>Không có câu nào khớp bộ lọc.</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
