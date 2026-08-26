import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

interface Row {
  id: string
  title: string
  wave_number: number
  open_at: string
  close_at: string
  class_id: string
  class_name: string
  class_code: string
}

export default function TeacherAllExams() {
  const { teacher } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('exams')
        .select('id, title, wave_number, open_at, close_at, class_id, classes(class_name, class_code)')
        .eq('teacher_id', teacher!.id)
        .order('created_at', { ascending: false })

      const mapped: Row[] = (data || []).map((e: any) => ({
        id: e.id,
        title: e.title,
        wave_number: e.wave_number,
        open_at: e.open_at,
        close_at: e.close_at,
        class_id: e.class_id,
        class_name: e.classes?.class_name || '',
        class_code: e.classes?.class_code || '',
      }))
      setRows(mapped)
      setLoading(false)
    }
    load()
  }, [teacher])

  return (
    <div className="container">
      <div className="card">
        <h2>📚 Ngân hàng đề thi</h2>
        <p style={{ fontSize: 13 }}>
          Toàn bộ đề thi đã tạo được lưu lại vĩnh viễn tại đây, không bao giờ tự động xóa — kể cả các đợt thi
          từ những lớp/năm học trước, giúp bạn tái sử dụng hoặc đối chiếu khi cần.
        </p>
      </div>

      <div className="card">
        {loading && <p>Đang tải...</p>}
        <table className="list">
          <thead>
            <tr>
              <th>Lớp</th>
              <th>Đợt</th>
              <th>Tên đề thi</th>
              <th>Mở cổng</th>
              <th>Đóng cổng</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="badge">{r.class_code}</span> {r.class_name}
                </td>
                <td>#{r.wave_number}</td>
                <td>{r.title}</td>
                <td>{new Date(r.open_at).toLocaleDateString('vi-VN')}</td>
                <td>{new Date(r.close_at).toLocaleDateString('vi-VN')}</td>
                <td style={{ display: 'flex', gap: 12 }}>
                  <Link to={`/teacher/exams/${r.id}/results`}>Thống kê</Link>
                  <Link to={`/teacher/classes/${r.class_id}`}>Lớp</Link>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--muted)' }}>
                  Chưa có đề thi nào được tạo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
