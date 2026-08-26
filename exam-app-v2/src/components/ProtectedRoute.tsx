import { Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

export function TeacherRoute({ children }: { children: ReactNode }) {
  const { teacher, loadingTeacher } = useAuth()
  if (loadingTeacher) return <div className="container">Đang tải...</div>
  if (!teacher) return <Navigate to="/teacher/login" replace />
  return <>{children}</>
}

export function StudentRoute({ children }: { children: ReactNode }) {
  const { student } = useAuth()
  if (!student) return <Navigate to="/student/login" replace />
  return <>{children}</>
}
