import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { generateSimilarQuestions } from '../utils/generateSimilar'
import { Exam, Question } from '../types'

export default function TeacherExamSimilar() {
  const { examId } = useParams()
  const { teacher } = useAuth()
  const navigate = useNavigate()

  const [sourceExam, setSourceExam] = useState<Exam | null>(null)
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [waveNumber, setWaveNumber] = useState(1)
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')

  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from('exams').select('*').eq('id', examId).single()
      const { data: qs } = await supabase.from('questions').select('*').eq('exam_id', examId).order('order_index')
      if (e) {
        const exam = e as Exam
        setSourceExam(exam)
        setTitle(`${exam.title} - Đề tương tự`)
        setWaveNumber(exam.wave_number)
      }
      setSourceQuestions((qs as Question[]) || [])
      setLoading(false)
    }
    load()
  }, [examId])

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!sourceExam) return
    if (!title || !openAt || !closeAt) return setError('Điền đầy đủ tên đề, giờ mở/đóng cổng thi.')
    if (sourceQuestions.length === 0) return setError('Đề gốc chưa có câu hỏi nào để tạo bản tương tự.')

    setGenerating(true)
    try {
      setProgress(`Đang nhờ AI đổi số cho ${sourceQuestions.length} câu (có thể mất 1-2 phút)...`)
      const variants = await generateSimilarQuestions(
        sourceQuestions.map((q) => ({
          part: q.part,
          content_html: q.content_html,
          options: q.options,
          correct_answer: q.correct_answer ?? null,
          explanation_html: q.explanation_html ?? '',
        })),
      )

      setProgress('Đang tạo đề mới...')
      const { data: newExam, error: examErr } = await supabase
        .from('exams')
        .insert({
          teacher_id: teacher!.id,
          class_id: sourceExam.class_id,
          title,
          wave_number: waveNumber,
          duration_minutes: sourceExam.duration_minutes,
          open_at: new Date(openAt).toISOString(),
          close_at: new Date(closeAt).toISOString(),
          scoring_method: sourceExam.scoring_method,
          requires_previous_wave: sourceExam.requires_previous_wave,
        })
        .select()
        .single()
      if (examErr) throw examErr

      const rows = sourceQuestions.map((q, i) => ({
        exam_id: newExam.id,
        order_index: i + 1,
        part: q.part,
        content_html: variants[i].content_html,
        image_url: q.image_url ?? null,
        options: variants[i].options,
        correct_answer: variants[i].correct_answer,
        explanation_html: variants[i].explanation_html,
        points: q.points,
      }))
      const { error: qErr } = await supabase.from('questions').insert(rows)
      if (qErr) throw qErr

      navigate(`/teacher/exams/${newExam.id}/edit`)
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi sinh đề tương tự.')
      setGenerating(false)
      setProgress(null)
    }
  }

  if (loading) return <div className="container">Đang tải...</div>

  return (
    <div className="container">
      <Link to={`/teacher/exams/${examId}/edit`} className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Quay lại đề gốc
      </Link>

      <div className="card">
        <h2>🔁 Sinh đề tương tự — {sourceExam?.title}</h2>
        <p style={{ fontSize: 13 }}>
          Tạo một đề thi MỚI, giữ nguyên toàn bộ {sourceQuestions.length} câu hỏi và cấu trúc của đề gốc — AI chỉ đổi
          số liệu (hệ số, dữ kiện) trong từng câu rồi tính lại đáp án đúng. Phù hợp làm đề luyện tập thêm hoặc đề đợt
          2 cho học sinh chưa đạt. Đề gốc không bị ảnh hưởng gì.
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--danger)' }}>
          ⚠️ AI có thể tính sai với câu phức tạp — sau khi tạo xong, hãy rà lại đề ở màn hình chỉnh sửa trước khi mở
          cổng thi cho học sinh.
        </p>
      </div>

      <form onSubmit={handleGenerate}>
        <div className="card">
          <label>Tên đề thi mới</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />

          <label>Đợt thi số mấy</label>
          <input type="number" min={1} value={waveNumber} onChange={(e) => setWaveNumber(Number(e.target.value))} />

          <label>Giờ mở cổng thi</label>
          <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />

          <label>Giờ đóng cổng thi</label>
          <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {progress && <p>{progress}</p>}
        <button className="btn" type="submit" disabled={generating}>
          {generating ? 'Đang tạo...' : `Sinh đề tương tự (${sourceQuestions.length} câu)`}
        </button>
      </form>
    </div>
  )
}
