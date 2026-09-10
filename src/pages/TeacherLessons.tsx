import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Chapter, Lesson } from '../types'

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
}

/**
 * Upload 1 file lên kho lưu trữ (Supabase Storage, bucket "lesson-files"),
 * tổ chức theo thư mục: khoi-<khối>/<tên chương>/<timestamp>-<tên file>.
 * Trả về link công khai để lưu vào exam_file_link/solution_file_link/link.
 */
async function uploadToStorage(file: File, grade: string, chapterTitle: string): Promise<string> {
  const folder = `khoi-${grade}/${slugify(chapterTitle) || 'chung'}`
  const safeName = slugify(file.name.replace(/\.[^.]+$/, '')) || 'file'
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${folder}/${Date.now()}-${safeName}${ext}`

  const { error } = await supabase.storage.from('lesson-files').upload(path, file, { upsert: false })
  if (error) throw error

  const { data } = supabase.storage.from('lesson-files').getPublicUrl(path)
  return data.publicUrl
}

export default function TeacherLessons() {
  const { teacher } = useAuth()
  const [grade, setGrade] = useState('10')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessonsByChapter, setLessonsByChapter] = useState<Record<string, Lesson[]>>({})

  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({})
  const [newLessonLink, setNewLessonLink] = useState<Record<string, string>>({})
  const [newExamFileLink, setNewExamFileLink] = useState<Record<string, string>>({})
  const [newSolutionFileLink, setNewSolutionFileLink] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<string | null>(null) // đang tải file nào (key = chapterId+field)
  const [error, setError] = useState<string | null>(null)

  async function loadChapters() {
    const { data: ch } = await supabase
      .from('chapters')
      .select('*')
      .eq('teacher_id', teacher!.id)
      .eq('grade', grade)
      .order('order_index')
    const chapterList = (ch as Chapter[]) || []
    setChapters(chapterList)

    if (chapterList.length > 0) {
      const { data: ls } = await supabase
        .from('lessons')
        .select('*')
        .in('chapter_id', chapterList.map((c) => c.id))
        .order('order_index')
      const grouped: Record<string, Lesson[]> = {}
      for (const l of (ls as Lesson[]) || []) {
        if (!grouped[l.chapter_id]) grouped[l.chapter_id] = []
        grouped[l.chapter_id].push(l)
      }
      setLessonsByChapter(grouped)
    } else {
      setLessonsByChapter({})
    }
  }

  useEffect(() => {
    loadChapters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade])

  async function handleAddChapter(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newChapterTitle.trim()) return
    const { error } = await supabase.from('chapters').insert({
      teacher_id: teacher!.id,
      grade,
      title: newChapterTitle.trim(),
      order_index: chapters.length,
    })
    if (error) return setError(error.message)
    setNewChapterTitle('')
    loadChapters()
  }

  async function handleDeleteChapter(id: string, title: string) {
    if (!window.confirm(`Xóa chương "${title}" và toàn bộ bài giảng bên trong?`)) return
    await supabase.from('chapters').delete().eq('id', id)
    loadChapters()
  }

  async function handleAddLesson(chapterId: string, e: FormEvent) {
    e.preventDefault()
    setError(null)
    const title = (newLessonTitle[chapterId] || '').trim()
    const link = (newLessonLink[chapterId] || '').trim()
    const examFileLink = (newExamFileLink[chapterId] || '').trim()
    const solutionFileLink = (newSolutionFileLink[chapterId] || '').trim()
    if (!title || !link) return
    const order = (lessonsByChapter[chapterId]?.length || 0)
    const { error } = await supabase.from('lessons').insert({
      chapter_id: chapterId,
      title,
      link,
      exam_file_link: examFileLink || null,
      solution_file_link: solutionFileLink || null,
      order_index: order,
    })
    if (error) return setError(error.message)
    setNewLessonTitle((p) => ({ ...p, [chapterId]: '' }))
    setNewLessonLink((p) => ({ ...p, [chapterId]: '' }))
    setNewExamFileLink((p) => ({ ...p, [chapterId]: '' }))
    setNewSolutionFileLink((p) => ({ ...p, [chapterId]: '' }))
    loadChapters()
  }

  async function handleDeleteLesson(id: string) {
    await supabase.from('lessons').delete().eq('id', id)
    loadChapters()
  }

  async function handleUploadFile(
    chapterId: string,
    chapterTitle: string,
    field: 'lesson' | 'exam' | 'solution',
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0]
    if (!file) return
    const uploadKey = `${chapterId}-${field}`
    setUploading(uploadKey)
    setError(null)
    try {
      const url = await uploadToStorage(file, grade, chapterTitle)
      if (field === 'lesson') setNewLessonLink((p) => ({ ...p, [chapterId]: url }))
      if (field === 'exam') setNewExamFileLink((p) => ({ ...p, [chapterId]: url }))
      if (field === 'solution') setNewSolutionFileLink((p) => ({ ...p, [chapterId]: url }))
    } catch (err: any) {
      setError(`Lỗi khi tải file lên: ${err.message || err}`)
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📖 Quản lý Chương & Bài giảng</h2>
        <p style={{ fontSize: 13 }}>
          Tổ chức bài giảng theo Chương. Với mỗi bài, bạn có thể <b>tải file trực tiếp lên hệ thống</b> (được lưu
          gọn theo thư mục <code>khoi-{grade}/&lt;tên chương&gt;/...</code>) thay vì phải tải lên Google Drive rồi
          dán link — hoặc vẫn dán link ngoài (YouTube, Drive...) nếu muốn. Học sinh sẽ thấy đúng bài giảng theo
          khối lớp của mình.
        </p>
        <label>Chọn khối để soạn</label>
        <select value={grade} onChange={(e) => setGrade(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="10">Khối 10</option>
          <option value="11">Khối 11</option>
          <option value="12">Khối 12</option>
        </select>
      </div>

      <div className="card">
        <h3>+ Thêm chương mới (Khối {grade})</h3>
        <form onSubmit={handleAddChapter} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <input
              value={newChapterTitle}
              onChange={(e) => setNewChapterTitle(e.target.value)}
              placeholder='VD: "Chương 1: Mệnh đề - Tập hợp"'
            />
          </div>
          <button className="btn" type="submit" style={{ marginBottom: 12 }}>
            Thêm chương
          </button>
        </form>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      {chapters.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>{c.title}</h3>
            <button className="btn danger" style={{ padding: '4px 12px', fontSize: 12.5 }} onClick={() => handleDeleteChapter(c.id, c.title)}>
              Xóa chương
            </button>
          </div>

          {(lessonsByChapter[c.id] || []).map((l) => (
            <div className="tf-row" key={l.id}>
              <span style={{ flex: 1 }}>{l.title}</span>
              <a href={l.link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                Bài giảng →
              </a>
              {l.exam_file_link && (
                <a href={l.exam_file_link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  📄 Đề
                </a>
              )}
              {l.solution_file_link && (
                <a href={l.solution_file_link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                  📝 Lời giải
                </a>
              )}
              <button className="btn danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => handleDeleteLesson(l.id)}>
                Xóa
              </button>
            </div>
          ))}

          <form onSubmit={(e) => handleAddLesson(c.id, e)} style={{ marginTop: 12 }}>
            <label>Tên bài</label>
            <input
              value={newLessonTitle[c.id] || ''}
              onChange={(e) => setNewLessonTitle((p) => ({ ...p, [c.id]: e.target.value }))}
              placeholder='VD: "Bài 1: Mệnh đề"'
            />

            {(
              [
                { field: 'lesson' as const, label: 'Bài giảng (bắt buộc)', value: newLessonLink[c.id], set: setNewLessonLink },
                { field: 'exam' as const, label: 'File đề đính kèm (tùy chọn)', value: newExamFileLink[c.id], set: setNewExamFileLink },
                { field: 'solution' as const, label: 'File lời giải tham khảo (tùy chọn)', value: newSolutionFileLink[c.id], set: setNewSolutionFileLink },
              ]
            ).map((row) => {
              const uploadKey = `${c.id}-${row.field}`
              return (
                <div key={row.field} style={{ marginBottom: 10 }}>
                  <label>{row.label}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      style={{ flex: 1, minWidth: 200, marginBottom: 0 }}
                      value={row.value || ''}
                      onChange={(e) => row.set((p) => ({ ...p, [c.id]: e.target.value }))}
                      placeholder="Dán link ngoài (YouTube, Drive...) hoặc tải file lên →"
                    />
                    <label className="btn secondary" style={{ display: 'inline-flex', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {uploading === uploadKey ? 'Đang tải lên...' : '📤 Tải file lên'}
                      <input
                        type="file"
                        style={{ display: 'none' }}
                        disabled={uploading === uploadKey}
                        onChange={(e) => handleUploadFile(c.id, c.title, row.field, e)}
                      />
                    </label>
                  </div>
                </div>
              )
            })}

            <button className="btn secondary" type="submit">
              + Thêm bài
            </button>
          </form>
        </div>
      ))}

      {chapters.length === 0 && (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>Chưa có chương nào cho Khối {grade}.</p>
        </div>
      )}
    </div>
  )
}
