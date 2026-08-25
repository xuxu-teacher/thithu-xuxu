import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function TeacherLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) return setError(error.message)
    navigate('/teacher/dashboard')
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setLoading(false)
      return setError(error.message)
    }
    if (data.user) {
      await supabase.from('teachers').insert({ id: data.user.id, full_name: fullName, email })
    }
    setLoading(false)
    navigate('/teacher/dashboard')
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>{mode === 'login' ? 'Đăng nhập Giáo viên' : 'Tạo tài khoản Giáo viên'}</h2>
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <>
              <label>Họ và tên</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </>
          )}
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>
        <p style={{ marginTop: 12, fontSize: 13 }}>
          {mode === 'login' ? (
            <>
              Chưa có tài khoản?{' '}
              <a href="#" onClick={() => setMode('register')}>
                Đăng ký
              </a>
            </>
          ) : (
            <>
              Đã có tài khoản?{' '}
              <a href="#" onClick={() => setMode('login')}>
                Đăng nhập
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
