import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { Chapter, Lesson } from '../types'

export default function TeacherLessons() {
  const { teacher } = useAuth()
  const [grade, setGrade] = useState('10')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessonsByChapter, setLessonsByChapter] = useState<Record<string, Lesson[]>>({})

  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({})
  const [newLessonLink, setNewLessonLink] = useState<Record<string, string>>({})
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
    if (!title || !link) return
    const order = (lessonsByChapter[chapterId]?.length || 0)
    const { error } = await supabase.from('lessons').insert({ chapter_id: chapterId, title, link, order_index: order })
    if (error) return setError(error.message)
    setNewLessonTitle((p) => ({ ...p, [chapterId]: '' }))
    setNewLessonLink((p) => ({ ...p, [chapterId]: '' }))
    loadChapters()
  }

  async function handleDeleteLesson(id: string) {
    await supabase.from('lessons').delete().eq('id', id)
    loadChapters()
  }

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📖 Quản lý Chương & Bài giảng</h2>
        <p style={{ fontSize: 13 }}>
          Tổ chức bài giảng theo Chương, gắn link (video, tài liệu, Google Drive...) cho từng bài. Học sinh sẽ
          thấy đúng bài giảng theo khối lớp của mình.
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
                Xem link →
              </a>
              <button className="btn danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => handleDeleteLesson(l.id)}>
                Xóa
              </button>
            </div>
          ))}

          <form onSubmit={(e) => handleAddLesson(c.id, e)} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label>Tên bài</label>
              <input
                value={newLessonTitle[c.id] || ''}
                onChange={(e) => setNewLessonTitle((p) => ({ ...p, [c.id]: e.target.value }))}
                placeholder='VD: "Bài 1: Mệnh đề"'
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>Link bài dạy</label>
              <input
                value={newLessonLink[c.id] || ''}
                onChange={(e) => setNewLessonLink((p) => ({ ...p, [c.id]: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <button className="btn secondary" type="submit" style={{ marginBottom: 12 }}>
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
