import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Exam } from '../types'

interface Row {
  student_id: string
  full_name: string
  student_code: string
  status: string
  score: number | null
  submitted_at: string | null
  tab_switch_count: number
  is_catchup: boolean
}

const statusLabel: Record<string, string> = {
  submitted: 'Đã nộp',
  in_progress: 'Đang làm',
  missed: 'Bỏ thi',
  not_started: 'Chưa bắt đầu',
  disqualified: 'Bị loại',
}

function toScale10(score: number, max: number): number {
  if (max <= 0) return 0
  return Math.round((score / max) * 100) / 10
}

/** Chuyển "2026-08-26T13:00" (giờ local input) <-> ISO để hiển thị trong <input type=datetime-local> */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const CHEAT_THRESHOLD = 2 // từ 2 lần rời tab trở lên mới cảnh báo, tránh báo nhầm do vô ý

export default function TeacherExamResults() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState<Exam | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [maxPoints, setMaxPoints] = useState(0)
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  async function load() {
    const { data: e } = await supabase.from('exams').select('*').eq('id', examId).single()
    setExam(e as Exam)
    if (e) {
      setOpenAt(toLocalInputValue((e as Exam).open_at))
      setCloseAt(toLocalInputValue((e as Exam).close_at))
    }

    const { data: questions } = await supabase.from('questions').select('points').eq('exam_id', examId)
    setMaxPoints((questions || []).reduce((sum: number, q: any) => sum + Number(q.points), 0))

    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, student_code')
      .eq('class_id', (e as Exam).class_id)

    const { data: attempts } = await supabase
      .from('attempts')
      .select('student_id, status, score, submitted_at, tab_switch_count, is_catchup')
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
        tab_switch_count: a?.tab_switch_count ?? 0,
        is_catchup: a?.is_catchup ?? false,
      }
    })
    setRows(merged)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId])

  async function handleSaveSchedule(e: FormEvent) {
    e.preventDefault()
    setSavingSchedule(true)
    const { error } = await supabase
      .from('exams')
      .update({ open_at: new Date(openAt).toISOString(), close_at: new Date(closeAt).toISOString() })
      .eq('id', examId)
    setSavingSchedule(false)
    if (error) { alert('Lỗi khi lưu: ' + error.message); return }
    setEditingSchedule(false)
    load()
  }

  async function handleDeleteExam() {
    if (!exam) return
    if (!window.confirm(`Xóa vĩnh viễn đề thi "${exam.title}" (Đợt #${exam.wave_number})? Toàn bộ câu hỏi và kết quả của học sinh trong đề này sẽ bị xóa theo. Không thể hoàn tác.`)) return
    const { error } = await supabase.from('exams').delete().eq('id', examId)
    if (error) { alert('Lỗi khi xóa: ' + error.message); return }
    navigate(`/teacher/classes/${exam.class_id}`)
  }

  if (!exam) return <div className="container">Đang tải...</div>

  const submittedScores = rows.filter((r) => r.status === 'submitted' && r.score !== null).map((r) => r.score as number)
  const scale10 = submittedScores.map((s) => toScale10(s, maxPoints))
  const avg = scale10.length ? Math.round((scale10.reduce((a, b) => a + b, 0) / scale10.length) * 10) / 10 : 0
  const max10 = scale10.length ? Math.max(...scale10) : 0
  const min10 = scale10.length ? Math.min(...scale10) : 0

  const buckets = [0, 0, 0, 0, 0]
  const bucketLabels = ['0-2', '2-4', '4-6', '6-8', '8-10']
  for (const s of scale10) buckets[Math.min(4, Math.floor(s / 2))]++
  const maxBucket = Math.max(1, ...buckets)

  const notStarted = rows.filter((r) => r.status === 'not_started' || r.status === 'missed')
  const suspicious = rows.filter((r) => r.tab_switch_count >= CHEAT_THRESHOLD)

  return (
    <div className="container">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <Link to="/teacher/dashboard" className="btn secondary">← Trang chủ giáo viên</Link>
        <Link to={`/teacher/classes/${exam.class_id}`} className="btn secondary">← Về lớp</Link>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2>{exam.title} — Đợt #{exam.wave_number}</h2>
            <p style={{ fontSize: 13 }}>Tổng điểm đề: {maxPoints} · Đã nộp: {submittedScores.length}/{rows.length}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to={`/teacher/exams/${examId}/edit`} className="btn secondary">✏️ Sửa đề (câu hỏi)</Link>
            <button className="btn danger" onClick={handleDeleteExam}>🗑 Xóa đề thi</button>
          </div>
        </div>

        {!editingSchedule ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge">Mở: {new Date(exam.open_at).toLocaleString('vi-VN')}</span>
            <span className="badge">Đóng: {new Date(exam.close_at).toLocaleString('vi-VN')}</span>
            <button className="btn secondary" onClick={() => setEditingSchedule(true)}>✏️ Sửa giờ mở/đóng cổng</button>
          </div>
        ) : (
          <form onSubmit={handleSaveSchedule} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label>Giờ mở cổng</label>
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} required />
            </div>
            <div>
              <label>Giờ đóng cổng</label>
              <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} required />
            </div>
            <button className="btn" type="submit" disabled={savingSchedule} style={{ marginBottom: 12 }}>
              {savingSchedule ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button type="button" className="btn secondary" style={{ marginBottom: 12 }} onClick={() => setEditingSchedule(false)}>
              Hủy
            </button>
          </form>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          Có thể chỉnh giờ mở/đóng cổng bất cứ lúc nào — kể cả khi đề đang mở hoặc đã đóng (ví dụ để mở lại cho học
          sinh thi bù).
        </p>
      </div>

      {submittedScores.length > 0 && (
        <div className="card">
          <h3>Thống kê điểm (thang điểm 10)</h3>
          <div className="stat-cards">
            <div className="stat-card"><div className="value">{avg}</div><div className="label">Điểm trung bình</div></div>
            <div className="stat-card"><div className="value">{max10}</div><div className="label">Điểm cao nhất</div></div>
            <div className="stat-card"><div className="value">{min10}</div><div className="label">Điểm thấp nhất</div></div>
            <div className="stat-card"><div className="value">{submittedScores.length}</div><div className="label">Đã nộp bài</div></div>
          </div>
          <div className="bar-chart">
            {buckets.map((count, i) => (
              <div className="bar-col" key={i}>
                <div className="bar-count">{count}</div>
                <div className="bar" style={{ height: `${(count / maxBucket) * 100}%` }} />
                <div className="bar-label">{bucketLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {notStarted.length > 0 && (
        <div className="card">
          <h3>⏳ Học sinh chưa làm bài ({notStarted.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {notStarted.map((r) => (
              <span key={r.student_id} className="badge warn">
                {r.student_code} — {r.full_name} ({statusLabel[r.status]})
              </span>
            ))}
          </div>
        </div>
      )}

      {suspicious.length > 0 && (
        <div className="card">
          <h3>🚩 Học sinh có dấu hiệu rời khỏi màn hình khi làm bài</h3>
          <p style={{ fontSize: 12.5 }}>
            Hệ thống ghi nhận số lần chuyển sang tab/cửa sổ khác trong lúc làm bài — có thể là dấu hiệu tra cứu
            tài liệu ngoài, nhưng cũng có thể do lỗi mạng/thiết bị. Giáo viên nên xem xét thêm trước khi kết luận.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {suspicious.map((r) => (
              <span key={r.student_id} className="badge wrong">
                {r.student_code} — {r.full_name}: rời tab {r.tab_switch_count} lần
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Chi tiết từng học sinh</h3>
        <table className="list">
          <thead>
            <tr>
              <th>Mã HS</th>
              <th>Họ và tên</th>
              <th>Trạng thái</th>
              <th>Điểm (thang 10)</th>
              <th>Rời tab</th>
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
                  {r.is_catchup && <span className="badge warn" style={{ marginLeft: 4 }}>làm bù</span>}
                </td>
                <td>{r.score !== null ? toScale10(r.score, maxPoints) : '-'}</td>
                <td>
                  {r.tab_switch_count > 0 ? (
                    <span className={`badge ${r.tab_switch_count >= CHEAT_THRESHOLD ? 'wrong' : 'warn'}`}>{r.tab_switch_count} lần</span>
                  ) : '-'}
                </td>
                <td>{r.submitted_at ? new Date(r.submitted_at).toLocaleString('vi-VN') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
