import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ClassRoom } from '../types'

export default function TeacherDashboard() {
  const { teacher } = useAuth()
  const [classes, setClasses] = useState<ClassRoom[]>([])
  const [className, setClassName] = useState('')
  const [classCode, setClassCode] = useState('')
  const [grade, setGrade] = useState('10')
  const [error, setError] = useState<string | null>(null)

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', teacher!.id)
      .order('created_at', { ascending: false })
    setClasses((data as ClassRoom[]) || [])
  }

  useEffect(() => {
    loadClasses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreateClass(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase
      .from('classes')
      .insert({ teacher_id: teacher!.id, class_name: className, class_code: classCode, grade })
    if (error) return setError(error.message)
    setClassName('')
    setClassCode('')
    loadClasses()
  }

  return (
    <div className="container">
      <div className="card">
        <h2>Tạo lớp mới</h2>
        <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Tên lớp</label>
            <input value={className} onChange={(e) => setClassName(e.target.value)} required />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label>Mã lớp (để học sinh đăng nhập)</label>
            <input value={classCode} onChange={(e) => setClassCode(e.target.value)} required />
          </div>
          <div style={{ width: 120 }}>
            <label>Khối</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="10">Khối 10</option>
              <option value="11">Khối 11</option>
              <option value="12">Khối 12</option>
            </select>
          </div>
          <button className="btn" type="submit" style={{ marginBottom: 12 }}>
            Tạo lớp
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      <div className="card">
        <h2>Danh sách lớp</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Tên lớp</th>
              <th>Khối</th>
              <th>Mã lớp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.id}>
                <td>{c.class_name}</td>
                <td>{c.grade || '-'}</td>
                <td>
                  <span className="badge">{c.class_code}</span>
                </td>
                <td>
                  <Link to={`/teacher/classes/${c.id}`}>Quản lý →</Link>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: 'var(--muted)' }}>
                  Chưa có lớp nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
