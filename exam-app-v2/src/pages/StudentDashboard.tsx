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

export default function StudentDashboard() {
  const { student } = useAuth()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('list_exams_for_student', {
        p_class_id: student!.class_id,
        p_student_id: student!.id,
      })
      setRows((data as Row[]) || [])
    }
    load()
  }, [student])

  const now = Date.now()

  return (
    <div className="container">
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
          } else if (r.attempt_status === 'missed') {
            action = <span className="badge wrong">Đã bỏ lỡ đợt thi này</span>
          } else if (!isOpenNow && now < open) {
            action = <span className="badge">Chưa mở cổng thi</span>
          } else if (!isOpenNow && now > close) {
            action = <span className="badge wrong">Đã đóng cổng thi</span>
          } else {
            action = (
              <Link to={`/student/exams/${r.exam_id}/take`} className="btn">
                Vào thi
              </Link>
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
