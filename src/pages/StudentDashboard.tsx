import { ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

interface Row {
  exam_id: string
  title: string
  wave_number: number
  duration_minutes: number
  open_at: string
  close_at: string
  attempt_status: string
  eligible: boolean
}

interface ProgressRow {
  exam_id: string
  title: string
  wave_number: number
  score: number
  max_points: number
  submitted_at: string
}

function stabilityLabel(stdDev: number): { text: string; cls: string } {
  if (stdDev <= 0.5) return { text: 'Rất ổn định', cls: 'correct' }
  if (stdDev <= 1.2) return { text: 'Khá ổn định', cls: '' }
  return { text: 'Có biến động', cls: 'warn' }
}

export default function StudentDashboard() {
  const { student } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [progress, setProgress] = useState<ProgressRow[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('list_exams_for_student', {
        p_class_id: student!.class_id,
        p_student_id: student!.id,
      })
      setRows((data as Row[]) || [])

      const { data: prog } = await supabase.rpc('get_student_progress', { p_student_id: student!.id })
      setProgress((prog as ProgressRow[]) || [])
    }
    load()
  }, [student])

  const now = Date.now()

  const scale10 = progress.filter((p) => p.max_points > 0).map((p) => Math.round((p.score / p.max_points) * 100) / 10)
  const avg10 = scale10.length ? Math.round((scale10.reduce((a, b) => a + b, 0) / scale10.length) * 10) / 10 : 0
  const max10 = scale10.length ? Math.max(...scale10) : 0
  const variance = scale10.length ? scale10.reduce((s, v) => s + (v - avg10) ** 2, 0) / scale10.length : 0
  const stdDev = Math.round(Math.sqrt(variance) * 100) / 100
  const stability = stabilityLabel(stdDev)

  return (
    <div className="container">
      {scale10.length > 0 && (
        <div className="card">
          <h2>📈 Quá trình học tập của bạn</h2>
          <div className="stat-cards">
            <div className="stat-card"><div className="value">{avg10}</div><div className="label">Điểm trung bình</div></div>
            <div className="stat-card"><div className="value">{max10}</div><div className="label">Điểm cao nhất</div></div>
            <div className="stat-card">
              <div className="value"><span className={`badge ${stability.cls}`}>{stability.text}</span></div>
              <div className="label">Độ ổn định (lệch ±{stdDev})</div>
            </div>
            <div className="stat-card"><div className="value">{scale10.length}</div><div className="label">Số đợt đã thi</div></div>
          </div>
          <div className="bar-chart">
            {progress.map((p, i) => (
              <div className="bar-col" key={p.exam_id}>
                <div className="bar-count">{scale10[i]}</div>
                <div className="bar" style={{ height: `${(scale10[i] / 10) * 100}%` }} />
                <div className="bar-label">#{p.wave_number}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
            Mỗi cột là điểm (thang 10) của 1 đợt thi bạn đã hoàn thành, theo thứ tự thời gian. Độ lệch càng nhỏ
            nghĩa là kết quả giữa các đợt càng đồng đều, ổn định.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Các đợt thi của lớp bạn</h2>
        {rows.map((r) => {
          const open = new Date(r.open_at).getTime()
          const close = new Date(r.close_at).getTime()
          const isOpenNow = now >= open && now <= close
          let action: ReactNode = null

          if (r.attempt_status === 'submitted') {
            action = <Link to={`/student/exams/${r.exam_id}/result`}>Xem lại bài & lời giải →</Link>
          } else if (!r.eligible) {
            action = <span className="badge wrong">Chưa đủ điều kiện thi (cần hoàn thành đợt trước)</span>
          } else if (now < open) {
            action = <span className="badge">Chưa mở cổng thi</span>
          } else if (isOpenNow) {
            action = (
              <Link to={`/student/exams/${r.exam_id}/take`} className="btn">
                Vào thi
              </Link>
            )
          } else {
            // Đã đóng cổng thi nhưng chưa nộp bài (bỏ lỡ/chưa từng làm) — vẫn
            // cho phép làm bù để có thể mở khóa đợt thi tiếp theo.
            action = (
              <div>
                <span className="badge wrong" style={{ marginRight: 8 }}>Đã đóng cổng thi — chưa nộp bài</span>
                <Link to={`/student/exams/${r.exam_id}/take`} className="btn secondary">
                  🔄 Làm bù đề này
                </Link>
              </div>
            )
          }

          return (
            <div key={r.exam_id} className="question-block">
              <b>
                Đợt #{r.wave_number} — {r.title}
              </b>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                Thời lượng {r.duration_minutes} phút · Mở: {new Date(r.open_at).toLocaleString('vi-VN')} ·
                Đóng: {new Date(r.close_at).toLocaleString('vi-VN')}
              </p>
              <div>{action}</div>
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>Chưa có đợt thi nào.</p>}
      </div>
    </div>
  )
}
