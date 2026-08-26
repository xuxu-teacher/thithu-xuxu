import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { ClassRoom, Exam, Student } from '../types'

function randomCode(prefix: string) {
  return prefix + Math.random().toString(36).slice(2, 7).toUpperCase()
}

export default function TeacherClassDetail() {
  const { classId } = useParams()
  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [newName, setNewName] = useState('')
  const [lastCreated, setLastCreated] = useState<{ code: string; password: string } | null>(null)

  async function loadAll() {
    const { data: c } = await supabase.from('classes').select('*').eq('id', classId).single()
    setClassRoom(c as ClassRoom)
    const { data: s } = await supabase
      .from('students')
      .select('id, class_id, student_code, full_name')
      .eq('class_id', classId)
      .order('student_code')
    setStudents((s as Student[]) || [])
    const { data: e } = await supabase
      .from('exams')
      .select('*')
      .eq('class_id', classId)
      .order('wave_number')
    setExams((e as Exam[]) || [])
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  async function handleAddStudent(e: FormEvent) {
    e.preventDefault()
    const code = randomCode('HS')
    const password = Math.random().toString(36).slice(2, 8)
    const { data: hashed } = await supabase.rpc('hash_password', { plain: password })
    await supabase.from('students').insert({
      class_id: classId,
      student_code: code,
      full_name: newName,
      password_hash: hashed,
    })
    setLastCreated({ code, password })
    setNewName('')
    loadAll()
  }

  if (!classRoom) return <div className="container">Đang tải...</div>

  return (
    <div className="container">
      <div className="card">
        <h2>
          Lớp {classRoom.class_name} — <span className="badge">{classRoom.class_code}</span>
        </h2>
        <Link to={`/teacher/classes/${classId}/exams/new`} className="btn">
          + Tạo đề thi mới
        </Link>
      </div>

      <div className="card">
        <h3>Thêm học sinh</h3>
        <form onSubmit={handleAddStudent} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label>Họ và tên học sinh</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <button className="btn" type="submit" style={{ marginBottom: 12 }}>
            Thêm (tự sinh mã HS + mật khẩu)
          </button>
        </form>
        {lastCreated && (
          <p className="explanation">
            Đã tạo tài khoản — Mã HS: <b>{lastCreated.code}</b>, Mật khẩu: <b>{lastCreated.password}</b>{' '}
            (hãy sao chép/gửi cho học sinh ngay, hệ thống không hiển thị lại mật khẩu này).
          </p>
        )}

        <table className="list">
          <thead>
            <tr>
              <th>Mã học sinh</th>
              <th>Họ và tên</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Các đợt thi</h3>
        <table className="list">
          <thead>
            <tr>
              <th>Đợt</th>
              <th>Tên đề thi</th>
              <th>Mở cổng</th>
              <th>Đóng cổng</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {exams.map((ex) => (
              <tr key={ex.id}>
                <td>#{ex.wave_number}</td>
                <td>{ex.title}</td>
                <td>{new Date(ex.open_at).toLocaleString('vi-VN')}</td>
                <td>{new Date(ex.close_at).toLocaleString('vi-VN')}</td>
                <td>
                  <Link to={`/teacher/exams/${ex.id}/results`}>Xem kết quả →</Link>
                </td>
              </tr>
            ))}
            {exams.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--muted)' }}>
                  Chưa có đề thi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
