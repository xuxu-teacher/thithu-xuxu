import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
        <span className="topbar-logo">📘</span>
        Hệ thống thi thử trực tuyến
      </Link>
      <div className="topbar-right">
        {teacher && (
          <>
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
