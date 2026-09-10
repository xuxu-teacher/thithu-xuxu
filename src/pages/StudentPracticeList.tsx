import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { PracticeExam } from '../types'

export default function StudentPracticeList() {
  const { student } = useAuth()
  const [rows, setRows] = useState<PracticeExam[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('list_practice_exams', { p_class_id: student!.class_id })
      setRows((data as PracticeExam[]) || [])
      setLoading(false)
    }
    if (student) load()
  }, [student])

  return (
    <div className="container">
      <Link to="/student/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ
      </Link>

      <div className="card">
        <h2>📝 Đề thi thử — luyện tự do</h2>
        <p style={{ fontSize: 13 }}>
          Làm bao nhiêu lần cũng được, tự chấm điểm ngay khi nộp — không tính vào điểm chính thức, không ảnh hưởng
          gì đến kết quả các đợt kiểm tra thật.
        </p>
      </div>

      <div className="card">
        {loading && <p>Đang tải...</p>}
        {!loading && rows.length === 0 && <p style={{ color: 'var(--muted)' }}>Chưa có đề thi thử nào được tạo.</p>}
        {rows.map((r) => (
          <div key={r.id} className="tf-row">
            <div style={{ flex: 1 }}>
              <b>{r.title}</b>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>
                {r.question_count} câu · gợi ý {r.duration_minutes} phút
              </p>
            </div>
            <Link to={`/student/practice/${r.id}`} className="btn">
              Làm bài
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
