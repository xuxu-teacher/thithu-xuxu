import { Link } from 'react-router-dom'
import XuXuLogo from '../components/XuXuLogo'

const features = [
  { icon: '📝', title: 'Đúng cấu trúc Bộ GDĐT', desc: 'Trắc nghiệm, Đúng/Sai 4 ý, trả lời ngắn — theo định dạng thi tốt nghiệp THPT 2026.' },
  { icon: '🧮', title: 'Công thức toán chuẩn xác', desc: 'Hỗ trợ công thức từ Word (kể cả MathType), hiển thị sắc nét, không lỗi ký hiệu hay hình vẽ.' },
  { icon: '📊', title: 'Thống kê điểm số', desc: 'Xem điểm trung bình, cao nhất, thấp nhất và phổ điểm của cả lớp ngay sau mỗi đợt thi.' },
  { icon: '📚', title: 'Lưu trữ trọn bộ đề thi', desc: 'Toàn bộ đề thi được lưu lại vĩnh viễn — học sinh có thể tải về luyện lại bất cứ lúc nào.' },
]

export default function Home() {
  return (
    <div className="container">
      <div className="hero">
        <XuXuLogo size={88} />
        <h1>Lớp Toán Xu Xu</h1>
        <p style={{ maxWidth: 520, margin: '0 auto', fontSize: 15 }}>
          Hệ thống thi thử trực tuyến — bám sát cấu trúc đề thi của Bộ Giáo dục và Đào tạo, thân
          thiện với cả giáo viên và học sinh.
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
