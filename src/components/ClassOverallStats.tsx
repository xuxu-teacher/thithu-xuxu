import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Student } from '../types'

interface StudentStat {
  student_id: string
  full_name: string
  student_code: string
  count: number
  avg10: number
  max10: number
  stdDev: number // độ lệch chuẩn điểm (thang 10) — càng thấp càng ổn định
}

export default function ClassOverallStats({ classId, students }: { classId: string; students: Student[] }) {
  const [stats, setStats] = useState<StudentStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: exams } = await supabase.from('exams').select('id').eq('class_id', classId)
      const examIds = (exams || []).map((e: any) => e.id)
      if (examIds.length === 0) { setStats([]); setLoading(false); return }

      // Tổng điểm tối đa từng đề (để quy điểm mỗi lượt thi về thang 10)
      const { data: questions } = await supabase.from('questions').select('exam_id, points').in('exam_id', examIds)
      const maxByExam = new Map<string, number>()
      for (const q of questions || []) {
        maxByExam.set(q.exam_id, (maxByExam.get(q.exam_id) || 0) + Number(q.points))
      }

      const { data: attempts } = await supabase
        .from('attempts')
        .select('student_id, exam_id, score, status')
        .in('exam_id', examIds)
        .eq('status', 'submitted')

      const byStudent = new Map<string, number[]>()
      for (const a of attempts || []) {
        if (a.score === null) continue
        const max = maxByExam.get(a.exam_id) || 0
        if (max <= 0) continue
        const score10 = Math.round((Number(a.score) / max) * 100) / 10
        if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, [])
        byStudent.get(a.student_id)!.push(score10)
      }

      const result: StudentStat[] = students.map((s) => {
        const scores = byStudent.get(s.id) || []
        const count = scores.length
        const avg10 = count ? Math.round((scores.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0
        const max10 = count ? Math.max(...scores) : 0
        const variance = count ? scores.reduce((sum, s2) => sum + (s2 - avg10) ** 2, 0) / count : 0
        const stdDev = Math.round(Math.sqrt(variance) * 100) / 100
        return { student_id: s.id, full_name: s.full_name, student_code: s.student_code, count, avg10, max10, stdDev }
      })

      setStats(result)
      setLoading(false)
    }
    load()
  }, [classId, students])

  if (loading) return <p>Đang tải thống kê...</p>

  const withAttempts = stats.filter((s) => s.count > 0)
  if (withAttempts.length === 0) return <p style={{ color: 'var(--muted)' }}>Chưa có dữ liệu bài thi nào để thống kê.</p>

  const topScorer = [...withAttempts].sort((a, b) => b.max10 - a.max10)[0]
  // "Ổn định nhất": độ lệch chuẩn thấp nhất, chỉ xét học sinh đã thi từ 2 đợt trở lên
  const stableCandidates = withAttempts.filter((s) => s.count >= 2)
  const mostStable = stableCandidates.length
    ? [...stableCandidates].sort((a, b) => a.stdDev - b.stdDev)[0]
    : null

  return (
    <div>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="value">🏆 {topScorer.max10}</div>
          <div className="label">Điểm cao nhất — {topScorer.full_name}</div>
        </div>
        {mostStable ? (
          <div className="stat-card">
            <div className="value">🎯 ±{mostStable.stdDev}</div>
            <div className="label">Ổn định nhất — {mostStable.full_name} (TB {mostStable.avg10})</div>
          </div>
        ) : (
          <div className="stat-card">
            <div className="value">—</div>
            <div className="label">Cần ≥2 đợt thi để xét độ ổn định</div>
          </div>
        )}
      </div>

      <table className="list">
        <thead>
          <tr>
            <th>Mã HS</th>
            <th>Họ và tên</th>
            <th>Số đợt đã thi</th>
            <th>Điểm TB</th>
            <th>Điểm cao nhất</th>
            <th>Độ lệch (càng thấp càng ổn định)</th>
          </tr>
        </thead>
        <tbody>
          {stats
            .sort((a, b) => b.avg10 - a.avg10)
            .map((s) => (
              <tr key={s.student_id}>
                <td>{s.student_code}</td>
                <td>{s.full_name}</td>
                <td>{s.count}</td>
                <td>{s.count ? s.avg10 : '-'}</td>
                <td>{s.count ? s.max10 : '-'}</td>
                <td>{s.count >= 2 ? `±${s.stdDev}` : '-'}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
