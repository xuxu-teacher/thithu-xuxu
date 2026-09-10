import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import XuXuLogo from './XuXuLogo'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?'
}

export default function TopBar() {
  const { teacher, student, logoutTeacher, logoutStudent } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Chỉ hiện ĐÚNG 1 vai trò khớp với khu vực đang truy cập — tránh trường
  // hợp cả tài khoản giáo viên (Supabase Auth) và học sinh (localStorage)
  // cùng tồn tại trong trình duyệt (do dùng 2 cơ chế đăng nhập độc lập),
  // khiến thanh menu hiện chồng chéo cả 2 vai trò cùng lúc.
  const showTeacher = teacher && location.pathname.startsWith('/teacher')
  const showStudent = student && location.pathname.startsWith('/student')

  return (
    <div className="topbar">
      <Link to="/" className="topbar-brand">
        <XuXuLogo size={34} />
        Lớp Toán Xu Xu — Thi thử trực tuyến
      </Link>
      <div className="topbar-right">
        {showTeacher && (
          <>
            <Link to="/teacher/lessons" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài giảng
            </Link>
            <Link to="/teacher/exams" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Ngân hàng đề thi
            </Link>
            <span className="topbar-user">
              <span className="avatar">{initials(teacher!.full_name)}</span>
              {teacher!.full_name}
            </span>
            <button
              className="link-btn"
              onClick={async () => {
                await logoutTeacher()
                navigate('/')
              }}
            >
              Đăng xuất
            </button>
          </>
        )}
        {showStudent && (
          <>
            <Link to="/student/dashboard" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài thi
            </Link>
            <Link to="/student/lessons" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài giảng
            </Link>
            <span className="topbar-user">
              <span className="avatar">{initials(student!.full_name)}</span>
              {student!.full_name} · {student!.class_code}
            </span>
            <button
              className="link-btn"
              onClick={() => {
                logoutStudent()
                navigate('/')
              }}
            >
              Đăng xuất
            </button>
          </>
        )}
      </div>
    </div>
  )
}
