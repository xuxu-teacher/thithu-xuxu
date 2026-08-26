import { Link } from 'react-router-dom'

const features = [
  { icon: '📝', title: 'Đúng cấu trúc Bộ GDĐT', desc: 'Trắc nghiệm, Đúng/Sai 4 ý, trả lời ngắn — theo định dạng thi tốt nghiệp THPT 2026.' },
  { icon: '🧮', title: 'Công thức toán chuẩn xác', desc: 'Hỗ trợ công thức từ Word, hiển thị sắc nét, không lỗi ký hiệu hay hình vẽ.' },
  { icon: '⏱️', title: 'Quản lý đợt thi linh hoạt', desc: 'Đặt giờ mở/đóng cổng thi, thiết lập điều kiện thi nối tiếp giữa các đợt.' },
  { icon: '📊', title: 'Chấm điểm minh bạch', desc: 'Hai cách tính điểm câu Đúng/Sai, xem lời giải chi tiết ngay sau khi nộp bài.' },
]

export default function Home() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Hệ thống thi thử trực tuyến</h1>
        <p style={{ maxWidth: 520, margin: '0 auto', fontSize: 15 }}>
          Nền tảng tổ chức thi thử dành cho giáo viên và học sinh — bám sát cấu trúc đề thi của
          Bộ Giáo dục và Đào tạo.
        </p>
        <div className="hero-actions">
          <Link to="/teacher/login" className="btn">
            🎓 Tôi là Giáo viên
          </Link>
          <Link to="/student/login" className="btn accent">
            🧑‍🎓 Tôi là Học sinh
          </Link>
        </div>
      </div>

      <div className="feature-grid">
        {features.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p style={{ fontSize: 13.5, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
