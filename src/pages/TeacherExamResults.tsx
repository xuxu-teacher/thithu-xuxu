import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Exam } from '../types'

interface Row {
  student_id: string
  full_name: string
  student_code: string
  status: string
  score: number | null
  submitted_at: string | null
}

const statusLabel: Record<string, string> = {
  submitted: 'Đã nộp',
  in_progress: 'Đang làm',
  missed: 'Bỏ thi',
  not_started: 'Chưa bắt đầu',
  disqualified: 'Bị loại',
}

/** Quy điểm thô về thang điểm 10 (chuẩn phổ biến ở VN) để thống kê dễ hiểu. */
function toScale10(score: number, max: number): number {
  if (max <= 0) return 0
  return Math.round((score / max) * 100) / 10
}

export default function TeacherExamResults() {
  const { examId } = useParams()
  const [exam, setExam] = useState<Exam | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [maxPoints, setMaxPoints] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from('exams').select('*').eq('id', examId).single()
      setExam(e as Exam)

      const { data: questions } = await supabase.from('questions').select('points').eq('exam_id', examId)
      setMaxPoints((questions || []).reduce((sum: number, q: any) => sum + Number(q.points), 0))

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_code')
        .eq('class_id', (e as Exam).class_id)

      const { data: attempts } = await supabase
        .from('attempts')
        .select('student_id, status, score, submitted_at')
        .eq('exam_id', examId)

      const attemptMap = new Map((attempts || []).map((a: any) => [a.student_id, a]))
      const merged: Row[] = (students || []).map((s: any) => {
        const a = attemptMap.get(s.id)
        return {
          student_id: s.id,
          full_name: s.full_name,
          student_code: s.student_code,
          status: a?.status || 'not_started',
          score: a?.score ?? null,
          submitted_at: a?.submitted_at ?? null,
        }
      })
      setRows(merged)
    }
    load()
  }, [examId])

  if (!exam) return <div className="container">Đang tải...</div>

  const submittedScores = rows.filter((r) => r.status === 'submitted' && r.score !== null).map((r) => r.score as number)
  const scale10 = submittedScores.map((s) => toScale10(s, maxPoints))
  const avg = scale10.length ? Math.round((scale10.reduce((a, b) => a + b, 0) / scale10.length) * 10) / 10 : 0
  const max10 = scale10.length ? Math.max(...scale10) : 0
  const min10 = scale10.length ? Math.min(...scale10) : 0

  // Phổ điểm theo 5 khoảng: 0-2, 2-4, 4-6, 6-8, 8-10
  const buckets = [0, 0, 0, 0, 0]
  const bucketLabels = ['0-2', '2-4', '4-6', '6-8', '8-10']
  for (const s of scale10) {
    const idx = Math.min(4, Math.floor(s / 2))
    buckets[idx]++
  }
  const maxBucket = Math.max(1, ...buckets)

  return (
    <div className="container">
      <div className="card">
        <h2>
          {exam.title} — Đợt #{exam.wave_number}
        </h2>
        <p style={{ fontSize: 13 }}>Tổng điểm đề: {maxPoints} · Số học sinh đã nộp: {submittedScores.length}/{rows.length}</p>
      </div>

      {submittedScores.length > 0 && (
        <div className="card">
          <h3>Thống kê điểm (thang điểm 10)</h3>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="value">{avg}</div>
              <div className="label">Điểm trung bình</div>
            </div>
            <div className="stat-card">
              <div className="value">{max10}</div>
              <div className="label">Điểm cao nhất</div>
            </div>
            <div className="stat-card">
              <div className="value">{min10}</div>
              <div className="label">Điểm thấp nhất</div>
            </div>
            <div className="stat-card">
              <div className="value">{submittedScores.length}</div>
              <div className="label">Đã nộp bài</div>
            </div>
          </div>

          <div className="bar-chart">
            {buckets.map((count, i) => (
              <div className="bar-col" key={i}>
                <div className="bar-count">{count}</div>
                <div className="bar" style={{ height: `${(count / maxBucket) * 100}%` }} />
                <div className="bar-label">{bucketLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Chi tiết từng học sinh</h3>
        <table className="list">
          <thead>
            <tr>
              <th>Mã HS</th>
              <th>Họ và tên</th>
              <th>Trạng thái</th>
              <th>Điểm (thang 10)</th>
              <th>Thời gian nộp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td>{r.student_code}</td>
                <td>{r.full_name}</td>
                <td>
                  <span className={`badge ${r.status === 'submitted' ? 'correct' : r.status === 'missed' ? 'wrong' : ''}`}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </td>
                <td>{r.score !== null ? toScale10(r.score, maxPoints) : '-'}</td>
                <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('vi-VN') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
