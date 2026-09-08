import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

interface Row {
  chapter_id: string
  chapter_title: string
  chapter_order: number
  lesson_id: string
  lesson_title: string
  lesson_link: string
  lesson_order: number
}

export default function StudentLessons() {
  const { student } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.rpc('get_student_lessons', { p_student_id: student!.id })
      setRows((data as Row[]) || [])
      setLoading(false)
    }
    load()
  }, [student])

  const chapterMap = new Map<string, { title: string; lessons: Row[] }>()
  for (const r of rows) {
    if (!chapterMap.has(r.chapter_id)) chapterMap.set(r.chapter_id, { title: r.chapter_title, lessons: [] })
    chapterMap.get(r.chapter_id)!.lessons.push(r)
  }

  return (
    <div className="container">
      <div className="card">
        <h2>📖 Bài giảng</h2>
        <p style={{ fontSize: 13 }}>Toàn bộ bài giảng theo chương do giáo viên của lớp bạn biên soạn.</p>
      </div>

      {loading && <div className="card">Đang tải...</div>}

      {!loading && chapterMap.size === 0 && (
        <div className="card">
          <p style={{ color: 'var(--muted)' }}>Chưa có bài giảng nào được đăng.</p>
        </div>
      )}

      {[...chapterMap.entries()].map(([chapterId, ch]) => (
        <div className="card" key={chapterId}>
          <h3>{ch.title}</h3>
          {ch.lessons.map((l) => (
            <div className="tf-row" key={l.lesson_id}>
              <span style={{ flex: 1 }}>{l.lesson_title}</span>
              <a href={l.lesson_link} target="_blank" rel="noreferrer" className="btn secondary" style={{ padding: '6px 14px', fontSize: 13 }}>
                Xem bài giảng →
              </a>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
