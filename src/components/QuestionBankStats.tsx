import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { listBankQuestions } from '../utils/questionBank'
import { getCurriculumTopics } from '../data/curriculumTopics'
import { QuestionBankItem } from '../types'

const PARTS: { key: 'mcq' | 'true_false' | 'short_answer'; label: string }[] = [
  { key: 'mcq', label: 'Trắc nghiệm' },
  { key: 'true_false', label: 'Đúng/Sai' },
  { key: 'short_answer', label: 'Trả lời ngắn' },
]
const GRADES: ('10' | '11' | '12')[] = ['10', '11', '12']

export default function QuestionBankStats() {
  const { teacher } = useAuth()
  const [items, setItems] = useState<QuestionBankItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!teacher) return
      const data = await listBankQuestions(teacher.id)
      setItems(data)
      setLoading(false)
    }
    load()
  }, [teacher])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div className="card">
      <h2>📊 Thống kê kho câu hỏi theo Khối — Chương — Dạng</h2>
      {GRADES.map((grade) => {
        const gradeItems = items.filter((q) => q.grade === grade)
        if (gradeItems.length === 0) return null
        const topics = getCurriculumTopics(grade)
        return (
          <div key={grade} style={{ marginBottom: 20 }}>
            <h3>Khối {grade} ({gradeItems.length} câu)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="list">
                <thead>
                  <tr>
                    <th>Chương</th>
                    {PARTS.map((p) => (
                      <th key={p.key}>{p.label}</th>
                    ))}
                    <th>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map((topic) => {
                    const topicItems = gradeItems.filter((q) => q.topic === topic)
                    if (topicItems.length === 0) return null
                    return (
                      <tr key={topic}>
                        <td>{topic}</td>
                        {PARTS.map((p) => (
                          <td key={p.key}>{topicItems.filter((q) => q.part === p.key).length}</td>
                        ))}
                        <td>
                          <b>{topicItems.length}</b>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: '#f5f8ff' }}>
                    <td>
                      <b>Tổng Khối {grade}</b>
                    </td>
                    {PARTS.map((p) => (
                      <td key={p.key}>
                        <b>{gradeItems.filter((q) => q.part === p.key).length}</b>
                      </td>
                    ))}
                    <td>
                      <b>{gradeItems.length}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
