import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getDisclosureForClass } from '../utils/teacherDisclosure'
import { TeacherDisclosure } from '../types'

// ============================================================
// ĐƠN ĐĂNG KÍ HỌC THÊM — đúng theo cấu trúc mẫu ĐƠN_ĐĂNG_KÍ_HỌC_THÊM.docx
// ============================================================

function todayVi() {
  const d = new Date()
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`
}

export default function StudentTuitionApplication() {
  const { student } = useAuth()
  const navigate = useNavigate()
  const [disclosure, setDisclosure] = useState<TeacherDisclosure | null>(null)
  const [classInfo, setClassInfo] = useState<{ tuition_fee: string | null; schedule_info: string | null; study_duration: string | null } | null>(null)

  const [studentFullName, setStudentFullName] = useState('')
  const [studentSchoolClass, setStudentSchoolClass] = useState('')
  const [studentSchoolName, setStudentSchoolName] = useState('')
  const [subjectRegistered, setSubjectRegistered] = useState('Toán')
  const [gradeRegistered, setGradeRegistered] = useState<'10' | '11' | '12'>('10')
  const [isDirectStudent, setIsDirectStudent] = useState(false) // mặc định: KHÔNG phải học sinh trực tiếp giảng dạy
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentConsentText, setParentConsentText] = useState('')
  const [note, setNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [d, info] = await Promise.all([
        getDisclosureForClass(student!.class_id),
        supabase.rpc('get_class_public_info', { p_class_id: student!.class_id }),
      ])
      setDisclosure(d)
      setClassInfo(info.data?.[0] ?? null)
    }
    if (student) load()
  }, [student])

  const honorific = disclosure?.teacher_honorific || 'Cô'
  const teacherName = disclosure?.teacher_display_name || ''
  const businessName = disclosure?.business_name || ''
  const address = disclosure?.address || ''
  const schoolYear = disclosure?.school_year || ''

  const doiTuongText = isDirectStudent
    ? `là học sinh đang học lớp ${gradeRegistered}`
    : `là học sinh đang học lớp ${gradeRegistered} THPT không phải là học sinh trực tiếp giảng dạy của ${honorific} ${teacherName}`

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!studentFullName || !studentSchoolClass || !studentSchoolName || !parentName || !parentPhone) {
      setError('Điền đầy đủ các ô bắt buộc (tên học sinh, lớp, trường, họ tên và SĐT phụ huynh).')
      return
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.rpc('submit_tuition_application', {
      p_student_id: student!.id,
      p_class_id: student!.class_id,
      p_student_full_name: studentFullName,
      p_parent_name: parentName,
      p_parent_phone: parentPhone,
      p_note: note || null,
      p_student_school_name: studentSchoolName,
      p_student_school_class: studentSchoolClass,
      p_subject_registered: subjectRegistered,
      p_grade_registered: gradeRegistered,
      p_not_direct_student: !isDirectStudent,
      p_parent_consent_text: parentConsentText || null,
    })
    setSaving(false)
    if (err) setError(err.message)
    else setDone(true)
  }

  if (done) {
    return (
      <div className="container">
        <div className="card">
          <h2>✅ Đã gửi đơn thành công</h2>
          <p>Giáo viên sẽ xem lại đơn của bạn trong mục quản lý.</p>
          <button className="btn" onClick={() => navigate('/student/dashboard')}>
            Về trang chủ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <Link to="/student/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ
      </Link>

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ fontFamily: 'Times New Roman, serif' }}>
          <p style={{ textAlign: 'center', margin: 0, fontWeight: 'bold' }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
          <p style={{ textAlign: 'center', margin: 0, fontWeight: 'bold' }}>Độc lập - Tự do - Hạnh phúc</p>
          <p style={{ textAlign: 'center', margin: '4px 0 16px' }}>---------------</p>
          <h2 style={{ textAlign: 'center' }}>ĐƠN ĐĂNG KÍ HỌC THÊM</h2>

          <label>Tên em là</label>
          <input value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Học sinh lớp (đang học ở trường)</label>
              <input value={studentSchoolClass} onChange={(e) => setStudentSchoolClass(e.target.value)} placeholder="VD: 11A3" />
            </div>
            <div style={{ flex: 2 }}>
              <label>Trường</label>
              <input value={studentSchoolName} onChange={(e) => setStudentSchoolName(e.target.value)} placeholder="VD: THPT số 1 Tư Nghĩa" />
            </div>
          </div>

          <p>
            Em viết đơn này kính mong cơ sở kinh doanh cho phép em được đăng kí học thêm
            {schoolYear ? ` năm học ${schoolYear}` : ''}, cụ thể như sau:
          </p>

          <p><b>1. Môn học đăng kí học thêm:</b></p>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label>Môn</label>
              <input value={subjectRegistered} onChange={(e) => setSubjectRegistered(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Khối</label>
              <select value={gradeRegistered} onChange={(e) => setGradeRegistered(e.target.value as '10' | '11' | '12')}>
                <option value="10">10</option>
                <option value="11">11</option>
                <option value="12">12</option>
              </select>
            </div>
          </div>
          <p style={{ fontStyle: 'italic' }}>→ Môn {subjectRegistered} - lớp {gradeRegistered}</p>

          <p><b>2. Đối tượng đăng kí học thêm:</b></p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              style={{ width: 'auto', marginBottom: 0 }}
              checked={isDirectStudent}
              onChange={(e) => setIsDirectStudent(e.target.checked)}
            />
            Em là học sinh đang được {honorific.toLowerCase()} {teacherName || '(giáo viên)'} trực tiếp giảng dạy tại trường
          </label>
          <p style={{ fontStyle: 'italic' }}>→ {doiTuongText}.</p>

          <p><b>3. Thời lượng học, địa điểm học và thỏa thuận học phí</b> (theo thông tin công khai của lớp):</p>
          <ul>
            <li>Thời lượng: {classInfo?.study_duration || '(chưa công khai)'} — Lịch học: {classInfo?.schedule_info || '(chưa công khai)'}</li>
            <li>Địa điểm học: Cơ sở kinh doanh {businessName || '(chưa kê khai)'} {address ? `- ${address}` : ''}</li>
            <li>Học phí: {classInfo?.tuition_fee || '(chưa công khai)'}</li>
          </ul>

          <p>
            Kính mong cơ sở kinh doanh và {honorific} {teacherName || '(giáo viên)'} cho em được đăng ký học tập. Em xin trân trọng cảm ơn!
          </p>
        </div>

        <div className="card">
          <h3>Kính gửi</h3>
          <p style={{ margin: 0 }}>- Cơ sở kinh doanh {businessName || '(chưa kê khai)'};</p>
          <p style={{ margin: 0 }}>- Giáo viên giảng dạy: {honorific} {teacherName || '(chưa kê khai)'}</p>
        </div>

        <div className="card">
          <h3>Thông tin phụ huynh</h3>
          <label>Họ và tên phụ huynh</label>
          <input value={parentName} onChange={(e) => setParentName(e.target.value)} />
          <label>Số điện thoại phụ huynh</label>
          <input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
          <label>Ý kiến của cha mẹ học sinh (gõ ý kiến và họ tên thay cho chữ ký)</label>
          <textarea rows={2} value={parentConsentText} onChange={(e) => setParentConsentText(e.target.value)} placeholder="VD: Tôi đồng ý cho con em đăng ký học thêm - Nguyễn Văn A" />
          <label>Ghi chú thêm (nếu có)</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Tư Nghĩa, {todayVi()} — NGƯỜI LÀM ĐƠN: {studentFullName || '...'}</p>
        </div>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Đang gửi...' : 'Gửi đơn'}
        </button>
      </form>
    </div>
  )
}
