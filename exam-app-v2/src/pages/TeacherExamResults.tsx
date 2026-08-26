import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Exam } from '../types'

interface Row {
  student_id: string
  full_name: string
  student_code: string
  status: string
  score: number | null
  submitted_at: string | null
}

export default function TeacherExamResults() {
  const { examId } = useParams()
  const [exam, setExam] = useState<Exam | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    async function load() {
      const { data: e } = await supabase.from('exams').select('*').eq('id', examId).single()
      setExam(e as Exam)

      const { data: students } = await supabase
        .from('students')
        .select('id, full_name, student_code')
        .eq('class_id', (e as Exam).class_id)

      const { data: attempts } = await supabase
        .from('attempts')
        .select('student_id, status, score, submitted_at')
        .eq('exam_id', examId)

      const attemptMap = new Map((attempts || []).map((a: any) => [a.student_id, a]))
      const merged: Row[] = (students || []).map((s: any) => {
        const a = attemptMap.get(s.id)
        return {
          student_id: s.id,
          full_name: s.full_name,
          student_code: s.student_code,
          status: a?.status || 'not_started',
          score: a?.score ?? null,
          submitted_at: a?.submitted_at ?? null,
        }
      })
      setRows(merged)
    }
    load()
  }, [examId])

  if (!exam) return <div className="container">Đang tải...</div>

  const statusLabel: Record<string, string> = {
    submitted: 'Đã nộp',
    in_progress: 'Đang làm',
    missed: 'Bỏ thi',
    not_started: 'Chưa bắt đầu',
    disqualified: 'Bị loại',
  }

  return (
    <div className="container">
      <div className="card">
        <h2>
          Kết quả — {exam.title} (Đợt #{exam.wave_number})
        </h2>
        <table className="list">
          <thead>
            <tr>
              <th>Mã HS</th>
              <th>Họ và tên</th>
              <th>Trạng thái</th>
              <th>Điểm</th>
              <th>Thời gian nộp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td>{r.student_code}</td>
                <td>{r.full_name}</td>
                <td>
                  <span className={`badge ${r.status === 'submitted' ? 'correct' : r.status === 'missed' ? 'wrong' : ''}`}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </td>
                <td>{r.score ?? '-'}</td>
                <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('vi-VN') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
