import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getDisclosureForClass, getScheduleForClass } from '../utils/teacherDisclosure'
import { TeacherDisclosure, TeacherScheduleRow } from '../types'
import ScheduleTable from '../components/ScheduleTable'

export default function StudentDisclosurePage() {
  const { student } = useAuth()
  const [info, setInfo] = useState<TeacherDisclosure | null>(null)
  const [rows, setRows] = useState<TeacherScheduleRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [d, s] = await Promise.all([
        getDisclosureForClass(student!.class_id),
        getScheduleForClass(student!.class_id),
      ])
      setInfo(d)
      setRows(s)
      setLoading(false)
    }
    if (student) load()
  }, [student])

  return (
    <div className="container">
      <Link to="/student/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ
      </Link>

      <div className="card">
        <h2>📋 Kê khai thông tin dạy thêm</h2>
      </div>

      {loading ? (
        <div className="card">Đang tải...</div>
      ) : !info ? (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>Giáo viên chưa kê khai thông tin.</p>
        </div>
      ) : (
        <>
          <div className="card">
            {info.business_name && <h3 style={{ marginTop: 0 }}>{info.business_name}</h3>}
            {info.address && <p><b>Địa chỉ:</b> {info.address}</p>}
            {info.phone && <p><b>Điện thoại:</b> {info.phone}</p>}
            {info.school_year && <p><b>Năm học:</b> {info.school_year}</p>}
            {info.subjects_info && (
              <>
                <p style={{ marginBottom: 4 }}><b>Các môn/khối tổ chức dạy thêm:</b></p>
                <p style={{ whiteSpace: 'pre-line' }}>{info.subjects_info}</p>
              </>
            )}
            {info.teaching_form && <p><b>Hình thức tổ chức:</b> {info.teaching_form}</p>}
            {info.tuition_rates && (
              <>
                <p style={{ marginBottom: 4 }}><b>Mức thu tiền học thêm:</b></p>
                <p style={{ whiteSpace: 'pre-line' }}>{info.tuition_rates}</p>
              </>
            )}
          </div>

          <div className="card">
            <h3>Thông tin người dạy</h3>
            {info.teacher_degree && <p><b>Trình độ chuyên môn:</b> {info.teacher_degree}</p>}
            {info.teacher_major && <p><b>Chuyên ngành đào tạo:</b> {info.teacher_major}</p>}
            {info.teacher_workplace && <p><b>Đơn vị công tác:</b> {info.teacher_workplace}</p>}
          </div>

          <div className="card">
            <h3>Thời khóa biểu</h3>
            <ScheduleTable rows={rows} editable={false} />
          </div>
        </>
      )}
    </div>
  )
}
