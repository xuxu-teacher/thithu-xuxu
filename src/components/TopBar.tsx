import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import XuXuLogo from './XuXuLogo'

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1]?.[0]?.toUpperCase() || '?'
}

function ToolsMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const items = [
    { to: '/teacher/question-bank', label: '📚 Kho câu hỏi' },
    { to: '/teacher/management', label: '🗂 Quản lý' },
    { to: '/teacher/word-standardize', label: '📄 Hỗ trợ Word' },
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="link-btn"
        style={{ color: 'rgba(255,255,255,0.9)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        onClick={() => setOpen((v) => !v)}
      >
        Công cụ {open ? '▲' : '▼'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            background: '#ffffff',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            minWidth: 200,
            padding: 6,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                color: '#1f2937',
                textDecoration: 'none',
                fontSize: 14,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f0ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
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
            <Link to="/teacher/lessons" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài giảng
            </Link>
            <Link to="/teacher/exams" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Ngân hàng đề thi
            </Link>
            <ToolsMenu />
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
            <Link to="/student/dashboard" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài thi
            </Link>
            <Link to="/student/lessons" className="link-btn" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Bài giảng
            </Link>
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
