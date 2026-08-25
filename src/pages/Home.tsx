import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <h1>Hệ thống thi thử trực tuyến</h1>
        <p style={{ color: 'var(--muted)' }}>
          Đề thi cấu trúc theo định dạng của Bộ Giáo dục và Đào tạo (áp dụng kỳ thi tốt nghiệp
          THPT 2026).
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 24 }}>
          <Link to="/teacher/login" className="btn">
            Tôi là Giáo viên
          </Link>
          <Link to="/student/login" className="btn secondary">
            Tôi là Học sinh
          </Link>
        </div>
      </div>
    </div>
  )
}
