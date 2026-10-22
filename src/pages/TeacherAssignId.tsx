import { ChangeEvent, useMemo, useState } from 'react'
import { extractPdfText } from '../utils/pdfText'
import { PartNo, splitQuestions } from '../utils/questionSplitter'
import { AiMeta, ClassifiedItem, classifyExam } from '../utils/aiClassify'
import {
  Level,
  LEVELS,
  LEVEL_NAMES,
  buildId6,
  describeDang,
  dangOptions,
  isValidDang,
  toDangCode,
} from '../utils/id6'
import { PART_HEADINGS, buildId6Docx, currentSchoolYear, docxFileName, downloadBlob } from '../utils/id6Docx'

interface Row {
  key: string
  part: PartNo
  num: number
  excerpt: string
  mdTag: number | null
  /** Ô nhập mã dạng (giáo viên có thể sửa) */
  dangInput: string
  level: Level
  aiNote: string
  aiInvalid?: string
}

function metaNotice(meta: AiMeta): string {
  const how = meta.mode === 'pdf' ? 'AI đọc trực tiếp file PDF' : 'AI đọc chữ rút từ PDF (file quá lớn để gửi nguyên)'
  if (meta.fromCache) return `${how}. Đề này đã gán trước đó — dùng lại kết quả đã lưu, không tốn lượt AI. Bấm "Gán lại bằng AI" nếu muốn chạy lại.`
  return `${how}. ` + (meta.provider === 'claude'
    ? `AI dùng: ${meta.model} (dự phòng trả phí, vì Gemini miễn phí đã hết lượt hôm nay).`
    : `AI dùng: ${meta.model} (miễn phí).`)
}

const DEFAULT_MD_MAP: Record<number, Level> = { 1: 'N', 2: 'H', 3: 'V', 4: 'C' }

function excerptOf(text: string): string {
  return text
    .replace(/^\s*C[âa]u\s+\d+\s*[.:]?\s*/i, '')
    .replace(/[[(]\s*M[ĐD]\s*\d\s*[\])]\s*/i, '')
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

export default function TeacherAssignId() {
  const [files, setFiles] = useState<File[]>([])
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear())
  const [mdMap, setMdMap] = useState<Record<number, Level>>(DEFAULT_MD_MAP)
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const options = useMemo(() => dangOptions(), [])

  function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []).filter((f) => /\.pdf$/i.test(f.name))
    setFiles(list)
    setRows([])
    setNotices([])
    setError(null)
    setStatus(null)
  }

  function levelFor(mdTag: number | null | undefined, aiLevel: Level): Level {
    return mdTag && mdMap[mdTag] ? mdMap[mdTag] : aiLevel
  }

  async function handleAssign(force = false) {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    setNotices([])
    setRows([])
    try {
      // 1) Rút chữ để đối chiếu số câu (và dự phòng khi file quá lớn)
      setStatus('Đang đọc file PDF…')
      let fullText = ''
      for (const f of files) {
        try {
          fullText += (await extractPdfText(f)).text + '\n'
        } catch {
          /* PDF lỗi lớp chữ — vẫn gửi nguyên file cho AI */
        }
      }
      const split = splitQuestions(fullText)
      const localByKey = new Map(split.questions.map((q) => [`${q.part}-${q.num}`, q]))
      const msgs: string[] = []

      // 2) Gửi cả đề cho AI trong 1 lượt
      setStatus('AI đang đọc đề và gán ID… (thường 20–60 giây)')
      const { items, declared, meta } = await classifyExam(files, split.questions, { force })
      msgs.push(metaNotice(meta))

      // 3) Ghép kết quả + bổ sung câu AI bỏ sót
      const result: Row[] = items.map((it) => {
        const local = localByKey.get(`${it.part}-${it.num}`)
        const md = it.mdTag ?? local?.mdTag ?? null
        const excerpt =
          meta.mode === 'pdf' ? it.start || (local ? excerptOf(local.text) : '') : local ? excerptOf(local.text) : it.start || ''
        return toRow(it, md, excerpt, md)
      })
      const missing: string[] = []
      for (const p of [1, 2, 3] as PartNo[]) {
        const aiNums = items.filter((it) => it.part === p).map((it) => it.num)
        const localCount = split.questions.filter((q) => q.part === p).length
        const expected = Math.max(declared[p] ?? 0, localCount, aiNums.length ? Math.max(...aiNums) : 0)
        for (let n = 1; n <= expected; n++) {
          if (aiNums.includes(n)) continue
          const local = localByKey.get(`${p}-${n}`)
          missing.push(`Phần ${p} câu ${n}`)
          result.push({
            key: `${p}-${n}-missing`,
            part: p,
            num: n,
            excerpt: local ? excerptOf(local.text) : '',
            mdTag: local?.mdTag ?? null,
            dangInput: '',
            level: levelFor(local?.mdTag ?? null, 'H'),
            aiNote: '',
            aiInvalid: '(AI bỏ sót câu này — hãy chọn dạng)',
          })
        }
      }
      result.sort((x, y) => x.part - y.part || x.num - y.num)

      const cnt = (p: PartNo) => result.filter((r) => r.part === p).length
      msgs.push(`Tổng ${result.length} câu: Phần I ${cnt(1)}, Phần II ${cnt(2)}, Phần III ${cnt(3)}.`)
      const declaredText = ([1, 2, 3] as PartNo[])
        .filter((p) => declared[p])
        .map((p) => `Phần ${p}: ${declared[p]}`)
        .join(', ')
      if (declaredText) msgs.push(`Số câu đề ghi: ${declaredText}.`)
      if (missing.length) msgs.push(`⚠ Đã thêm dòng trống cho câu AI bỏ sót: ${missing.join(', ')}.`)
      const needFix = result.filter((r) => !isValidDang(toDangCode(r.dangInput) || '')).length
      if (needFix) msgs.push(`${needFix} câu chưa có mã hợp lệ (tô đỏ) — hãy chọn lại dạng trước khi tải Word.`)
      setRows(result)
      setNotices(msgs)
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  function toRow(it: ClassifiedItem, mdTag: number | null, excerpt: string, tagForLevel: number | null): Row {
    return {
      key: `${it.part}-${it.num}`,
      part: it.part,
      num: it.num,
      excerpt: excerpt || it.note,
      mdTag,
      dangInput: it.dangCode,
      level: levelFor(tagForLevel, it.aiLevel),
      aiNote: it.note,
      aiInvalid: it.invalidCode,
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function onDangChange(row: Row, value: string) {
    // Cho phép dán cả ID đầy đủ (vd 2D1H2-2): lấy luôn mức độ trong đó
    const v = value.split('·')[0].trim()
    const full = v.replace(/[[\]\s]/g, '').toUpperCase().match(/^[0-2][DHC][0-9]([NHVC])[0-9]-\d{1,2}$/)
    const patch: Partial<Row> = { dangInput: v }
    if (full) {
      patch.level = full[1] as Level
      patch.dangInput = toDangCode(v) || v
    }
    updateRow(row.key, patch)
  }

  function addRow(part: PartNo) {
    setRows((prev) => {
      const nums = prev.filter((r) => r.part === part).map((r) => r.num)
      const num = nums.length ? Math.max(...nums) + 1 : 1
      const row: Row = { key: `${part}-${num}-${Date.now()}`, part, num, excerpt: '', mdTag: null, dangInput: '', level: 'H', aiNote: '' }
      return [...prev, row].sort((a, b) => a.part - b.part || a.num - b.num)
    })
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  const invalidRows = rows.filter((r) => !isValidDang(toDangCode(r.dangInput) || ''))
  const duplicateNums = ([1, 2, 3] as PartNo[]).flatMap((p) => {
    const nums = rows.filter((r) => r.part === p).map((r) => r.num)
    return nums.filter((n, i) => nums.indexOf(n) !== i).map((n) => `Phần ${p} câu ${n}`)
  })
  const outName = files[0] ? docxFileName(files[0].name) : ''

  async function handleDownload() {
    setError(null)
    if (invalidRows.length) return setError(`Còn ${invalidRows.length} câu chưa có mã dạng hợp lệ.`)
    if (duplicateNums.length) return setError(`Trùng số câu: ${[...new Set(duplicateNums)].join(', ')}.`)
    try {
      const blob = await buildId6Docx(
        rows.map((r) => ({ part: r.part, num: r.num, id6: buildId6(toDangCode(r.dangInput)!, r.level) })),
        schoolYear.trim()
      )
      downloadBlob(blob, outName)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="container" style={{ maxWidth: 1180 }}>
      <div className="card">
        <h2>Gán ID6 cho đề thi</h2>
        <p>
          Tải file PDF đề có lời giải (hoặc 2 file: đề trước, lời giải sau). AI đọc từng câu, chọn dạng theo bảng chia dạng ID6;
          cô rà lại bảng kết quả rồi tải file Word. File Word trùng tên với file PDF đầu tiên.
        </p>

        <label>File PDF</label>
        <input type="file" accept="application/pdf,.pdf" multiple onChange={onPickFiles} disabled={busy} />
        {files.length > 0 && (
          <p style={{ fontSize: 14 }}>
            {files.map((f) => f.name).join(' + ')}
            <br />→ File Word: <b>{outName}</b>
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>Năm học (dòng tiêu đề trang)</label>
            <input value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} style={{ width: 140 }} />
          </div>
          {[1, 2, 3, 4].map((md) => (
            <div key={md}>
              <label>Nhãn [MĐ{md}] →</label>
              <select
                value={mdMap[md]}
                onChange={(e) => setMdMap((m) => ({ ...m, [md]: e.target.value as Level }))}
                style={{ width: 150 }}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l} – {LEVEL_NAMES[l]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Câu có nhãn [MĐ…] trong đề lấy mức độ theo bảng quy đổi trên; câu không có nhãn do AI đánh giá.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => handleAssign(false)} disabled={busy || files.length === 0}>
            {busy ? 'Đang xử lý…' : 'Gán ID'}
          </button>
          {rows.length > 0 && (
            <button
              className="btn secondary"
              onClick={() => handleAssign(true)}
              disabled={busy}
              title="Bỏ qua kết quả đã lưu, gọi AI gán lại (tốn 1 lượt AI)"
            >
              Gán lại bằng AI
            </button>
          )}
        </div>
        {status && <p style={{ marginTop: 12 }}>{status}</p>}
        {error && <p style={{ color: 'var(--danger)', marginTop: 12 }}>{error}</p>}
        {notices.map((n, i) => (
          <p key={i} style={{ marginTop: 8, fontSize: 14 }}>
            • {n}
          </p>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Kết quả gán ID ({rows.length} câu)</h2>
            <button className="btn accent" onClick={handleDownload} disabled={busy}>
              Tải file Word
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
            Sửa mã dạng bằng cách gõ/chọn trong ô (có gợi ý), hoặc dán ID đầy đủ như 2D1H2-2. Dòng tô đỏ là mã chưa hợp lệ.
          </p>

          <datalist id="id6-dang-list">
            {options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </datalist>

          {([1, 2, 3] as PartNo[]).map((p) => {
            const partRows = rows.filter((r) => r.part === p)
            return (
              <div key={p} style={{ marginTop: 18 }}>
                <h3 style={{ color: 'var(--danger)' }}>{PART_HEADINGS[p]}</h3>
                <table className="list">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Câu</th>
                      <th>Nội dung (trích)</th>
                      <th style={{ width: 210 }}>Mã dạng</th>
                      <th style={{ width: 150 }}>Mức độ</th>
                      <th style={{ width: 110 }}>ID6</th>
                      <th style={{ width: 40 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {partRows.map((r) => {
                      const code = toDangCode(r.dangInput)
                      const valid = !!code && isValidDang(code)
                      const info = valid ? describeDang(code!) : null
                      return (
                        <tr key={r.key} style={valid ? undefined : { background: 'var(--danger-light)' }}>
                          <td>
                            <input
                              type="number"
                              min={1}
                              value={r.num}
                              onChange={(e) => updateRow(r.key, { num: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                              style={{ width: 56, marginBottom: 0 }}
                            />
                            {r.mdTag && (
                              <div>
                                <span className="badge" style={{ fontSize: 11 }}>
                                  MĐ{r.mdTag}
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 13 }}>
                            <div>{r.excerpt || <i style={{ color: 'var(--muted)' }}>(không có trích đoạn)</i>}</div>
                            {info && (
                              <div style={{ color: 'var(--primary-dark)', marginTop: 4 }}>
                                {info.grade} › {info.chapter} › {info.lesson} › <b>{info.dang}</b>
                              </div>
                            )}
                            {r.aiNote && <div style={{ color: 'var(--muted)', marginTop: 2 }}>AI: {r.aiNote}</div>}
                            {r.aiInvalid && (
                              <div style={{ color: 'var(--danger)', marginTop: 2 }}>AI trả mã không có trong bảng: {r.aiInvalid}</div>
                            )}
                          </td>
                          <td>
                            <input
                              list="id6-dang-list"
                              value={r.dangInput}
                              placeholder="vd 2D1X2-2"
                              onChange={(e) => onDangChange(r, e.target.value)}
                              style={{ marginBottom: 0, fontFamily: 'monospace' }}
                            />
                          </td>
                          <td>
                            <select
                              value={r.level}
                              onChange={(e) => updateRow(r.key, { level: e.target.value as Level })}
                              style={{ marginBottom: 0 }}
                            >
                              {LEVELS.map((l) => (
                                <option key={l} value={l}>
                                  {l} – {LEVEL_NAMES[l]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700, color: valid ? 'var(--danger)' : 'var(--muted)' }}>
                            {valid ? `[${buildId6(code!, r.level)}]` : '—'}
                          </td>
                          <td>
                            <button className="link-btn" title="Xoá dòng" onClick={() => removeRow(r.key)}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => addRow(p)}>
                  + Thêm câu vào phần {p === 1 ? 'I' : p === 2 ? 'II' : 'III'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
