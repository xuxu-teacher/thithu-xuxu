import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { StudentSession, TeacherSession } from '../types'

interface AuthState {
  teacher: TeacherSession | null
  student: StudentSession | null
  loadingTeacher: boolean
  loginStudent: (classCode: string, studentCode: string, password: string) => Promise<string | null>
  logoutStudent: () => void
  logoutTeacher: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const STUDENT_STORAGE_KEY = 'exam_app_student_session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<TeacherSession | null>(null)
  const [loadingTeacher, setLoadingTeacher] = useState(true)
  const [student, setStudent] = useState<StudentSession | null>(() => {
    const raw = localStorage.getItem(STUDENT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StudentSession) : null
  })

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        const { data: t } = await supabase
          .from('teachers')
          .select('id, full_name, email')
          .eq('id', data.session.user.id)
          .single()
        if (t) setTeacher(t as TeacherSession)
      }
      setLoadingTeacher(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: t } = await supabase
          .from('teachers')
          .select('id, full_name, email')
          .eq('id', session.user.id)
          .single()
        setTeacher((t as TeacherSession) || null)
      } else {
        setTeacher(null)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loginStudent(classCode: string, studentCode: string, password: string) {
    const { data, error } = await supabase.rpc('student_login', {
      p_class_code: classCode,
      p_student_code: studentCode,
      p_password: password,
    })
    if (error) return error.message
    if (!data || data.length === 0) return 'Sai mã lớp, mã học sinh hoặc mật khẩu.'

    const row = data[0]
    const session: StudentSession = {
      id: row.student_id,
      class_id: row.class_id,
      full_name: row.full_name,
      student_code: studentCode,
      class_code: classCode,
    }
    localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(session))
    setStudent(session)
    return null
  }

  function logoutStudent() {
    localStorage.removeItem(STUDENT_STORAGE_KEY)
    setStudent(null)
  }

  async function logoutTeacher() {
    await supabase.auth.signOut()
    setTeacher(null)
  }

  return (
    <AuthContext.Provider
      value={{ teacher, student, loadingTeacher, loginStudent, logoutStudent, logoutTeacher }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng bên trong <AuthProvider>')
  return ctx
}
