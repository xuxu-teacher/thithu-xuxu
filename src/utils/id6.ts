import { ID6_CHAPTERS, ID6_DANG, ID6_GRADES, ID6_LESSONS } from '../data/id6Taxonomy'

export type Level = 'N' | 'H' | 'V' | 'C'
export const LEVELS: Level[] = ['N', 'H', 'V', 'C']
export const LEVEL_NAMES: Record<Level, string> = {
  N: 'Nhận biết',
  H: 'Thông hiểu',
  V: 'Vận dụng',
  C: 'Vận dụng cao',
}

/** Map mã dạng (có X) → tên dạng */
const DANG_MAP = new Map<string, string>(ID6_DANG)

/** Chuẩn hoá mã dạng: bỏ ngoặc, khoảng trắng, đưa mức độ về X. "2D1H2-2" → "2D1X2-2" */
export function toDangCode(raw: string): string | null {
  const s = raw.replace(/[[\]\s]/g, '').toUpperCase()
  const m = s.match(/^([0-2])([DHC])([0-9])([NHVCX])([0-9])-([0-9]{1,2})$/)
  if (!m) return null
  return `${m[1]}${m[2]}${m[3]}X${m[5]}-${m[6]}`
}

export function isValidDang(code: string): boolean {
  return DANG_MAP.has(code)
}

/** Ghép mã dạng + mức độ thành ID6 hoàn chỉnh. "2D1X2-2" + "H" → "2D1H2-2" */
export function buildId6(dangCode: string, level: Level): string {
  return dangCode.replace(/^(\w{3})X/, `$1${level}`)
}

export interface DangInfo {
  grade: string
  chapter: string
  lesson: string
  dang: string
}

export function describeDang(code: string): DangInfo | null {
  const name = DANG_MAP.get(code)
  if (!name) return null
  const chapterKey = code.slice(0, 3)
  const lessonKey = code.split('-')[0]
  return {
    grade: ID6_GRADES[code[0]] || '',
    chapter: ID6_CHAPTERS[chapterKey] || '',
    lesson: ID6_LESSONS[lessonKey] || '',
    dang: name,
  }
}

/** Danh sách lựa chọn cho ô chọn dạng: [mã, nhãn hiển thị] */
export function dangOptions(): { code: string; label: string }[] {
  return ID6_DANG.map(([code, name]) => {
    const lessonKey = code.split('-')[0]
    return { code, label: `${code} · ${ID6_LESSONS[lessonKey] || ''} › ${name}` }
  })
}

/**
 * Bảng dạng toán dạng văn bản gọn để đưa vào prompt cho AI.
 * Nhóm theo Lớp → Chương → Bài, mỗi dạng một dòng "mã: tên".
 */
export function taxonomyPromptText(): string {
  const lines: string[] = []
  let lastChapter = ''
  let lastLesson = ''
  for (const [code, name] of ID6_DANG) {
    const chapterKey = code.slice(0, 3)
    const lessonKey = code.split('-')[0]
    if (chapterKey !== lastChapter) {
      lastChapter = chapterKey
      lines.push(`\n# ${ID6_GRADES[code[0]]} — Chương ${chapterKey}: ${ID6_CHAPTERS[chapterKey] || ''}`)
    }
    if (lessonKey !== lastLesson) {
      lastLesson = lessonKey
      lines.push(`## Bài ${lessonKey}: ${ID6_LESSONS[lessonKey] || ''}`)
    }
    lines.push(`${code}: ${name}`)
  }
  return lines.join('\n').trim()
}
