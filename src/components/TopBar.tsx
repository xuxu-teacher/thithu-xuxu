import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import XuXuLogo from './XuXuLogo'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?'
}

export default function TopBar() {
  const { teacher, student, logoutTeacher, logoutStudent } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="topbar">
      <Link to="/" className="topbar-brand">
        <XuXuLogo size={34} />
        Lớp Toán Xu Xu — Thi thử trực tuyến
      </Link>
      <div className="topbar-right">
        {teacher && (
          <>
            <Link to="/teacher/exams" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Ngân hàng đề thi
            </Link>
            <span className="topbar-user">
              <span className="avatar">{initials(teacher.full_name)}</span>
              {teacher.full_name}
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
        {student && (
          <>
            <span className="topbar-user">
              <span className="avatar">{initials(student.full_name)}</span>
              {student.full_name} · {student.class_code}
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
