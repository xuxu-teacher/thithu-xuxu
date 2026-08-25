import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function TopBar() {
  const { teacher, student, logoutTeacher, logoutStudent } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="topbar">
      <Link to="/" style={{ color: 'white', fontWeight: 600, textDecoration: 'none' }}>
        Hệ thống thi thử trực tuyến
      </Link>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {teacher && (
          <>
            <span>GV: {teacher.full_name}</span>
            <button
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
            <span>
              HS: {student.full_name} ({student.class_code})
            </span>
            <button
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
