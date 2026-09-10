import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { getBankCounts, bankCountKey, generateExamFromMatrix } from '../utils/questionBank'
import { Chapter, ClassRoom, MatrixCell, MatrixGenerateResult, QuestionDifficulty, QuestionPart, ScoringMethod } from '../types'

const DIFFICULTIES: QuestionDifficulty[] = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao']
const PARTS: { value: QuestionPart; label: string }[] = [
  { value: 'mcq', label: 'Trắc nghiệm' },
  { value: 'true_false', label: 'Đúng/Sai' },
  { value: 'short_answer', label: 'Trả lời ngắn' },
]

export default function TeacherExamFromMatrix() {
  const { classId } = useParams()
  const { teacher } = useAuth()
  const navigate = useNavigate()

  const [classRoom, setClassRoom] = useState<ClassRoom | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [bankCounts, setBankCounts] = useState<Map<string, number>>(new Map())

  const [title, setTitle] = useState('')
  const [waveNumber, setWaveNumber] = useState(1)
  const [duration, setDuration] = useState(90)
  const [openAt, setOpenAt] = useState('')
  const [closeAt, setCloseAt] = useState('')
  const [scoringMethod, setScoringMethod] = useState<ScoringMethod>('ministry_partial')
  const [requiresPrev, setRequiresPrev] = useState(true)

  const [rows, setRows] = useState<MatrixCell[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ examId: string; cells: MatrixGenerateResult[] } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: cls } = await supabase.from('classes').select('*').eq('id', classId).single()
      const room = cls as ClassRoom
      setClassRoom(room)
      if (!room?.grade) return

      const [{ data: ch }, counts] = await Promise.all([
        supabase.from('chapters').select('*').eq('teacher_id', teacher!.id).eq('grade', room.grade).order('order_index'),
        getBankCounts(teacher!.id, room.grade),
      ])
      const chapterList = (ch as Chapter[]) || []
      setChapters(chapterList)
      setBankCounts(counts)
      if (chapterList.length > 0) {
        setRows([{ topic: chapterList[0].title, difficulty: 'Nhận biết', part: 'mcq', count: 1 }])
      }
    }
    if (teacher && classId) load()
  }, [teacher, classId])

  const topics = chapters.map((c) => c.title)

  function addRow() {
    setRows((prev) => [...prev, { topic: topics[0] || '', difficulty: 'Nhận biết', part: 'mcq', count: 1 }])
  }
  function updateRow(idx: number, patch: Partial<MatrixCell>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const totalQuestions = rows.reduce((s, r) => s + (r.count || 0), 0)

  async function handleGenerate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    if (!classRoom?.grade) return setError('Lớp này chưa gắn khối — vào mục Bài giảng đặt khối cho lớp trước.')
    if (rows.length === 0 || totalQuestions === 0) return setError('Ma trận cần ít nhất 1 dòng với số câu > 0.')
    if (!title || !openAt || !closeAt) return setError('Điền đầy đủ tên đề, giờ mở/đóng cổng thi.')

    setSaving(true)
    try {
      const { data: exam, error: examErr } = await supabase
        .from('exams')
        .insert({
          teacher_id: teacher!.id,
          class_id: classId,
          title,
          wave_number: waveNumber,
          duration_minutes: duration,
          open_at: new Date(openAt).toISOString(),
          close_at: new Date(closeAt).toISOString(),
          scoring_method: scoringMethod,
          requires_previous_wave: requiresPrev,
        })
        .select()
        .single()
      if (examErr) throw examErr

      const cells = await generateExamFromMatrix(exam.id, teacher!.id, classRoom.grade!, rows)
      setResult({ examId: exam.id, cells })
    } catch (err: any) {
      setError(err.message || 'Có lỗi khi sinh đề từ ma trận.')
    } finally {
      setSaving(false)
    }
  }

  const shortfalls = result?.cells.filter((c) => c.inserted < c.requested) || []

  return (
    <div className="container">
      <Link to={`/teacher/classes/${classId}`} className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Quay lại lớp
      </Link>

      {result ? (
        <div className="card">
          <h2>{shortfalls.length > 0 ? '⚠ Đã sinh đề — nhưng thiếu câu ở một số ô' : '✅ Đã sinh đề thành công'}</h2>
          <p>Tổng số câu đã lấy: {result.cells.reduce((s, c) => s + c.inserted, 0)} / {totalQuestions} yêu cầu.</p>
          {shortfalls.length > 0 && (
            <>
              <p style={{ color: 'var(--danger)', fontSize: 13 }}>
                Kho câu hỏi chưa đủ câu ở các ô sau — hãy tải thêm đề vào Kho câu hỏi cho đúng chủ đề/mức độ này, hoặc
                sửa lại đề ở màn hình tiếp theo:
              </p>
              <ul style={{ fontSize: 13 }}>
                {shortfalls.map((c, i) => (
                  <li key={i}>
                    {c.topic} — {c.difficulty} — {PARTS.find((p) => p.value === c.part)?.label}: cần {c.requested}, lấy
                    được {c.inserted}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="btn" onClick={() => navigate(`/teacher/exams/${result.examId}/edit`)}>
            Xem & chỉnh sửa đề vừa tạo
          </button>
        </div>
      ) : (
        <form onSubmit={handleGenerate}>
          <div className="card">
            <h2>1. Thông tin đề thi {classRoom ? `— Lớp ${classRoom.class_name} (Khối ${classRoom.grade || '?'})` : ''}</h2>
            <label>Tên đề thi</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Đề kiểm tra Chương 1 - Đợt 1" />

            <label>Đợt thi số mấy</label>
            <input type="number" min={1} value={waveNumber} onChange={(e) => setWaveNumber(Number(e.target.value))} />

            <label>Thời gian làm bài (phút)</label>
            <input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />

            <label>Giờ mở cổng thi</label>
            <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />

            <label>Giờ đóng cổng thi</label>
            <input type="datetime-local" value={closeAt} onChange={(e) => setCloseAt(e.target.value)} />

            <label>Cách chấm câu Đúng/Sai</label>
            <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value as ScoringMethod)}>
              <option value="ministry_partial">Theo quy chế Bộ GDĐT (0.1/0.25/0.5/1 điểm)</option>
              <option value="equal_split">Chia đều theo số ý đúng</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                style={{ width: 'auto', marginBottom: 0 }}
                checked={requiresPrev}
                onChange={(e) => setRequiresPrev(e.target.checked)}
              />
              Yêu cầu học sinh phải hoàn thành đợt thi trước (đợt #{waveNumber - 1}) mới được thi đợt này.
            </label>
          </div>

          <div className="card">
            <h2>2. Ma trận đề</h2>
            <p style={{ fontSize: 13 }}>
              Mỗi dòng là một ô của ma trận: chủ đề × mức độ × dạng câu → số câu cần lấy ngẫu nhiên từ kho câu hỏi.
              Số "(còn X câu)" là số câu hiện có trong kho khớp đúng ô đó — nếu yêu cầu nhiều hơn, hệ thống sẽ lấy
              hết số câu hiện có và báo thiếu sau khi sinh đề.
            </p>

            {topics.length === 0 && (
              <p style={{ color: 'var(--danger)' }}>
                Khối {classRoom?.grade || '?'} chưa có Chương nào — không có chủ đề để dựng ma trận. Tạo Chương ở
                mục Bài giảng trước.
              </p>
            )}

            {rows.map((row, idx) => {
              const available = bankCounts.get(bankCountKey(row.topic, row.difficulty, row.part)) ?? 0
              return (
                <div key={idx} className="tf-row" style={{ flexWrap: 'wrap' }}>
                  <select style={{ flex: 2, minWidth: 200 }} value={row.topic} onChange={(e) => updateRow(idx, { topic: e.target.value })}>
                    {topics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select style={{ flex: 1, minWidth: 140 }} value={row.difficulty} onChange={(e) => updateRow(idx, { difficulty: e.target.value as QuestionDifficulty })}>
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select style={{ flex: 1, minWidth: 130 }} value={row.part} onChange={(e) => updateRow(idx, { part: e.target.value as QuestionPart })}>
                    {PARTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    style={{ width: 70, marginBottom: 0 }}
                    value={row.count}
                    onChange={(e) => updateRow(idx, { count: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 12.5, color: available < row.count ? 'var(--danger)' : 'var(--muted)' }}>
                    (còn {available} câu)
                  </span>
                  <button type="button" className="btn danger" style={{ padding: '4px 10px' }} onClick={() => removeRow(idx)}>
                    Xóa
                  </button>
                </div>
              )
            })}

            <button type="button" className="btn secondary" onClick={addRow} disabled={topics.length === 0}>
              + Thêm dòng ma trận
            </button>
            <p style={{ fontSize: 13, marginTop: 12 }}>
              Tổng số câu sẽ sinh: <b>{totalQuestions}</b>
            </p>
          </div>

          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Đang sinh đề...' : 'Sinh đề từ ma trận'}
          </button>
        </form>
      )}
    </div>
  )
}
