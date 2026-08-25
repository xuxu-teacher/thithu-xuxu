import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function StudentLogin() {
  const [classCode, setClassCode] = useState('')
  const [studentCode, setStudentCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { loginStudent } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const err = await loginStudent(classCode.trim(), studentCode.trim(), password)
    setLoading(false)
    if (err) return setError(err)
    navigate('/student/dashboard')
  }

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>Đăng nhập Học sinh</h2>
        <form onSubmit={handleSubmit}>
          <label>Mã lớp</label>
          <input value={classCode} onChange={(e) => setClassCode(e.target.value)} required />
          <label>Mã học sinh</label>
          <input value={studentCode} onChange={(e) => setStudentCode(e.target.value)} required />
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  )
}
