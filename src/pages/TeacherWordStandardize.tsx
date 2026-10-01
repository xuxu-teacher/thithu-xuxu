import { ChangeEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { parseGenericWordParagraphs } from '../utils/docxParser'
import { parseIntoBlocks, QuestionBlock, isOptionLine } from '../utils/normalizeWord'
import {
  loadRawDocx,
  repackDocxWithParagraphs,
  applyUnderlineToParagraphs,
  spliceAttachSolutions,
  splitOptionsIntoOwnParagraphs,
  extractHuongDanGiaiSection,
  downloadBlob,
  RawParagraph,
} from '../utils/docxSplice'
import { autoDetectCorrectRawParagraphs } from '../utils/detectCorrectAnswers' // dùng ở cả khối 2 và khối 3
import MathRenderer from '../components/MathRenderer'

type ColorScheme = 'black-on-white' | 'white-on-green'

// Nhãn phiên bản — hiện ngay dưới tiêu đề để biết chính xác bản nào đang chạy
// trên web (nếu vẫn thấy nhãn cũ nghĩa là bản mới CHƯA được triển khai xong).
const BUILD_TAG = '28-09-2026 · PDF chia trang, chụp từng trang (nhanh, không treo)'

export default function TeacherWordStandardize() {
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Đổi file -> các khối công cụ phải làm lại từ đầu (trước đây khối PDF vẫn
  // giữ kết quả đã xử lý của file CŨ nên tải về ra đúng nội dung cũ).
  const toolKey = file ? `${file.name}-${file.size}-${file.lastModified}` : 'none'

  return (
    <div className="container">
      <Link to="/teacher/dashboard" className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Trang chủ giáo viên
      </Link>

      <div className="card">
        <h2>📄 Hỗ trợ Word</h2>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 6px' }}>Phiên bản công cụ: {BUILD_TAG}</p>
        <p style={{ fontSize: 13 }}>
          Tải lên 1 file Word có các câu đánh số "Câu 1", "Câu 2"... — dùng chung cho cả 3 công cụ độc lập
          bên dưới, chọn công cụ nào tùy nhu cầu.
        </p>
        <label>Chọn file Word (.docx)</label>
        <input
          type="file"
          accept=".docx"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setFile(f)
            setFileName(f.name.replace(/\.docx$/i, ''))
            setError(null)
          }}
        />
        {file && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Đã chọn: {file.name}</p>}
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>

      {file && (
        <>
          <PdfBlankTool key={toolKey} file={file} fileName={fileName} onError={setError} />
          <NewlineOptionsTool key={toolKey} file={file} fileName={fileName} onError={setError} />
          <UnderlineWordTool key={toolKey} file={file} fileName={fileName} onError={setError} />
          <AttachSolutionWordTool key={toolKey} file={file} fileName={fileName} onError={setError} />
        </>
      )}
    </div>
  )
}

// ============================================================
// KHỐI 1 — Tạo file PDF có khoảng trống — tải PDF
// ============================================================
function PdfBlankTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [blocks, setBlocks] = useState<QuestionBlock[] | null>(null)
  const [blankLines, setBlankLines] = useState(3)
  const [colorScheme, setColorScheme] = useState<ColorScheme>('black-on-white')
  const [processing, setProcessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  async function handleProcess() {
    setProcessing(true)
    onError(null)
    try {
      const paragraphs = await parseGenericWordParagraphs(file)
      setBlocks(parseIntoBlocks(paragraphs))
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi đọc file Word.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDownloadPdf() {
    const src = printRef.current
    if (!src) return
    setExporting(true)
    setExportNote(null)
    setProgress('Đang chuẩn bị...')
    let pageDiv: HTMLDivElement | null = null
    try {
      // Kích thước 1 trang A4 theo px CSS (rộng 794px như khung nội dung).
      const PAGE_W = 794
      const PAGE_H = 1123
      const PAD = 40
      const CONTENT_H = PAGE_H - PAD * 2
      const BLANK_LINE_PX = 22
      const dark = colorScheme === 'white-on-green'
      const bg = dark ? '#1f5c3f' : '#ffffff'
      const fg = dark ? '#ffffff' : '#111111'

      // Chờ font, ảnh và công thức dựng xong để đo chiều cao chính xác.
      await (document as any).fonts?.ready
      const imgs = Array.from(src.querySelectorAll('img'))
      await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => undefined) : undefined)))
      await new Promise((r) => setTimeout(r, 300))
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

      // 1) ĐO chiều cao từng khối (mỗi câu là 1 khối, không bao giờ bị cắt đôi
      //    giữa 2 trang — trừ khi riêng 1 câu dài hơn cả 1 trang).
      type PageItem =
        | { kind: 'block'; el: HTMLElement; shift: number; height: number }
        | { kind: 'spacer'; height: number }
      const pages: PageItem[][] = []
      let cur: PageItem[] = []
      let y = 0
      const finish = () => {
        pages.push(cur)
        cur = []
        y = 0
      }
      const addSpacer = (px: number) => {
        let left = px
        while (left > 0) {
          const room = CONTENT_H - y
          if (room <= 0) {
            finish()
            continue
          }
          const take = Math.min(left, room)
          cur.push({ kind: 'spacer', height: take })
          y += take
          left -= take
        }
      }

      const blockEls = Array.from(src.querySelectorAll<HTMLElement>('[data-pdf-block]'))
      for (const el of blockEls) {
        let h = Math.ceil(el.getBoundingClientRect().height)
        // Phòng trường hợp ảnh trong câu chưa kịp có kích thước ngay lúc đo
        // (trình duyệt trả về chiều cao 0 dù ảnh đã tải xong) — trước đây cả
        // câu bị bỏ qua hoàn toàn trong mọi trang, làm mất hẳn cả câu lẫn ảnh.
        // Giờ tính tạm chiều cao dựa theo kích thước gốc của ảnh, không bỏ sót.
        if (h === 0) {
          const img = el.querySelector('img') as HTMLImageElement | null
          if (img && img.naturalWidth > 0) {
            const w = el.clientWidth || PAGE_W - PAD * 2
            h = Math.ceil((img.naturalHeight / img.naturalWidth) * w) + 24
          }
        }
        if (h > 0) {
          if (h <= CONTENT_H) {
            if (y + h > CONTENT_H && y > 0) finish()
            cur.push({ kind: 'block', el, shift: 0, height: h })
            y += h
          } else {
            // Khối cao hơn 1 trang: chia theo từng lát, mỗi lát 1 trang.
            if (y > 0) finish()
            for (let shift = 0; shift < h; shift += CONTENT_H) {
              const part = Math.min(CONTENT_H, h - shift)
              cur.push({ kind: 'block', el, shift, height: part })
              y += part
              if (shift + CONTENT_H < h) finish()
            }
          }
        }
        // Khoảng trống để học sinh làm bài — không cần render, chỉ chừa chỗ.
        addSpacer(Number(el.dataset.blank || 0) * BLANK_LINE_PX)
      }
      if (cur.length > 0) finish()
      // Bỏ các trang trống ở cuối file (chỉ toàn khoảng trắng).
      while (pages.length > 0 && pages[pages.length - 1].every((it) => it.kind === 'spacer')) pages.pop()

      // 2) DỰNG PDF: mỗi trang chỉ chụp đúng nội dung của trang đó; trang toàn
      //    khoảng trống thì chỉ tô nền, không chụp gì cả.
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      const wMm = pdf.internal.pageSize.getWidth()
      const hMm = pdf.internal.pageSize.getHeight()

      for (let i = 0; i < pages.length; i++) {
        setProgress(`Đang tạo trang ${i + 1}/${pages.length}...`)
        // Nhường trình duyệt xử lý giữa các trang để không bị treo ("Page Unresponsive").
        await new Promise((r) => setTimeout(r, 0))

        if (i > 0) pdf.addPage()
        if (dark) {
          pdf.setFillColor(31, 92, 63)
          pdf.rect(0, 0, wMm, hMm, 'F')
        }
        const items = pages[i]
        if (!items.some((it) => it.kind === 'block')) continue

        pageDiv = document.createElement('div')
        pageDiv.style.cssText =
          `position:absolute;left:-9999px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;` +
          `padding:${PAD}px;overflow:hidden;background:${bg};color:${fg};` +
          `font-family:"Times New Roman",Times,serif;font-size:15px;line-height:2.1;`
        for (const it of items) {
          if (it.kind === 'spacer') {
            const sp = document.createElement('div')
            sp.style.height = `${it.height}px`
            pageDiv.appendChild(sp)
            continue
          }
          const wrap = document.createElement('div')
          wrap.style.cssText = `height:${it.height}px;overflow:hidden;`
          const clone = it.el.cloneNode(true) as HTMLElement
          clone.removeAttribute('data-pdf-block')
          clone.style.marginTop = `-${it.shift}px`
          wrap.appendChild(clone)
          pageDiv.appendChild(wrap)
        }
        document.body.appendChild(pageDiv)

        const canvas = await html2canvas(pageDiv, {
          scale: 2,
          useCORS: true,
          backgroundColor: bg,
          // Bỏ qua khung nguồn chứa TOÀN BỘ đề khi html2canvas sao chép trang —
          // đây là chỗ làm chậm/treo trước đây (mỗi lần chụp lại sao chép cả đề).
          ignoreElements: (el) => el.hasAttribute('data-pdf-source'),
          // index.html đặt "mjx-container { overflow-y: hidden; overflow-x: auto }".
          // Trên màn hình quy tắc này vô hại (mjx-container là phần tử inline nên
          // trình duyệt bỏ qua overflow), nhưng html2canvas vẫn CẮT theo khung
          // của nó — mà MathJax đặt line-height:0 cho mjx-container nên khung chỉ
          // cao ~1 dòng chữ → hệ { 2 dòng, phân số, căn... bị cắt mất phần trên/dưới.
          // Chỉ gỡ quy tắc này trong bản sao dùng để chụp, không ảnh hưởng giao diện.
          onclone: (doc) => {
            const st = doc.createElement('style')
            st.textContent =
              'mjx-container, mjx-container * { overflow: visible !important; max-width: none !important; }'
            doc.head.appendChild(st)
          },
        })
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wMm, hMm)
        document.body.removeChild(pageDiv)
        pageDiv = null
      }

      setProgress('Đang lưu file...')
      pdf.save(`${fileName || 'de'}-khoang-trong.pdf`)
    } catch (err: any) {
      onError('Có lỗi khi xuất PDF: ' + (err.message || err))
    } finally {
      if (pageDiv && pageDiv.parentNode) pageDiv.parentNode.removeChild(pageDiv)
      setProgress(null)
      setExporting(false)
    }
  }

  const isDark = colorScheme === 'white-on-green'
  const pageBg = isDark ? '#1f5c3f' : '#ffffff'
  const textColor = isDark ? '#ffffff' : '#111111'

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>📄 Tạo file PDF có khoảng trống — tải PDF</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Xóa lời giải, chèn khoảng trắng giữa mỗi câu để học sinh tự làm bài, xuất ra file PDF.
      </p>
      {!blocks ? (
        <button className="btn secondary" onClick={handleProcess} disabled={processing}>
          {processing ? 'Đang xử lý...' : 'Xử lý file'}
        </button>
      ) : (
        <>
          <label>Số dòng trống chèn giữa mỗi câu</label>
          <input
            type="number"
            min={0}
            max={50}
            value={blankLines}
            onChange={(e) => setBlankLines(Math.max(0, Math.min(50, Number(e.target.value))))}
            style={{ maxWidth: 120 }}
          />
          <label>Màu văn bản</label>
          <select value={colorScheme} onChange={(e) => setColorScheme(e.target.value as ColorScheme)}>
            <option value="black-on-white">Nền trắng — chữ đen</option>
            <option value="white-on-green">Nền xanh (bảng viết) — chữ trắng</option>
          </select>
          <button className="btn" onClick={handleDownloadPdf} disabled={exporting} style={{ marginTop: 12 }}>
            {exporting ? `⏳ ${progress || 'Đang tạo PDF...'}` : '⬇ Tải PDF'}
          </button>
          {exportNote && <p style={{ fontSize: 12.5, marginTop: 8, color: 'var(--danger)' }}>{exportNote}</p>}

          <div data-pdf-source="1" style={{ position: 'absolute', left: -9999, top: 0 }}>
            <div
              ref={printRef}
              style={{ width: '794px', boxSizing: 'border-box', background: pageBg, color: textColor, padding: 40, fontFamily: '"Times New Roman", Times, serif', fontSize: 15, lineHeight: 2.1 }}
            >
              {fileName && (
                <div data-pdf-block="1" data-blank="0" style={{ display: 'flow-root' }}>
                  <h2 style={{ color: textColor, textAlign: 'center' }}>{fileName}</h2>
                </div>
              )}
              {blocks.map((b) => (
                <div key={b.id} data-pdf-block="1" data-blank={b.number !== null ? blankLines : 0} style={{ display: 'flow-root' }}>
                  {renderQuestionOnly(b, textColor)}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// KHỐI — Chuẩn hóa đề cho Kho câu hỏi — tải về file Word
// ============================================================
// Gộp toàn bộ các bước cần thiết để 1 file sưu tầm (định dạng lộn xộn)
// trở thành đúng chuẩn có thể tải lên "Kho câu hỏi" cho hệ thống tự tách
// và phân loại câu hỏi: xuống dòng phương án, gạch chân đáp án đúng
// (trắc nghiệm + Đúng/Sai), chèn "Đáp số" cho câu trả lời ngắn, và dọn
// sạch phần lời giải (bỏ dòng ghi công tác giả/phản biện... không phải
// nội dung giải thật).
function NewlineOptionsTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [working, setWorking] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)

  async function handleRun() {
    setWorking(true)
    onError(null)
    setDoneNote(null)
    try {
      const raw = await loadRawDocx(file)

      // 0) Nếu file có mục "HƯỚNG DẪN GIẢI" riêng (đề bị lặp lại nhiều lần
      // trong cùng file — kiểu đề gốc + bảng đáp án + hướng dẫn giải đầy đủ)
      // thì CHỈ dùng đúng phần đó làm nguồn duy nhất, bỏ hẳn phần đề gốc và
      // đáp án phía trước.
      const huongDanSection = extractHuongDanGiaiSection(raw.paragraphs)
      const sourceParagraphs = huongDanSection || raw.paragraphs

      // 1) Xác định đáp án đúng (Chọn X / AI) và gạch chân — làm trước khi
      // tách dòng/ghép lại, lúc cấu trúc câu hỏi còn nguyên như file gốc.
      const { underlineTargets, shortAnswers } = await autoDetectCorrectRawParagraphs(sourceParagraphs)
      const underlined = applyUnderlineToParagraphs(sourceParagraphs, underlineTargets)

      // 2) Tách phương án dính chung dòng xuống dòng riêng.
      const withNewlines = splitOptionsIntoOwnParagraphs(underlined)

      // 3) Ghép lời giải vào đúng câu (đã tự lọc dòng rác), chèn "Đáp số" cho câu trả lời ngắn.
      const shortAnswerMap = new Map(shortAnswers.map((s) => [s.number, s.answerText]))
      const merged = spliceAttachSolutions(withNewlines, shortAnswerMap, 'Đáp số')

      const blob = await repackDocxWithParagraphs(raw.zip, raw.documentXml, merged.map((p) => p.xml))
      downloadBlob(blob, `${fileName || 'de'}-chuan-hoa-kho-de.docx`)
      setDoneNote(
        (huongDanSection ? '✅ Phát hiện mục "HƯỚNG DẪN GIẢI" riêng — đã bỏ phần đề gốc/đáp án phía trước, chỉ dùng phần này. ' : '') +
          `Đã xuống dòng phương án, gạch chân ${underlineTargets.length} đáp án, thêm ${shortAnswers.length} dòng "Đáp số", dọn lời giải và tải file Word về — sẵn sàng tải lên Kho câu hỏi.`,
      )
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi xử lý.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>↵ Chuẩn hóa đề cho Kho câu hỏi — tải về file Word</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Làm 1 lần đủ mọi bước để file sẵn sàng tải lên "Kho câu hỏi": nếu file có mục "HƯỚNG DẪN GIẢI" riêng
        (đề bị lặp lại nhiều lần trong file), tự bỏ phần đề gốc/đáp án phía trước, chỉ giữ phần đó; tự xuống
        dòng phương án (trắc nghiệm 4 lựa chọn và Đúng/Sai); tự gạch chân đáp án đúng; tự chèn "Đáp số: ..."
        giữa đề và lời giải cho câu trả lời ngắn; tự dọn sạch lời giải (bỏ dòng ghi công tác giả/phản biện...).
      </p>
      <button className="btn" onClick={handleRun} disabled={working}>
        {working ? '⏳ Đang xử lý...' : '↵ Chuẩn hóa & Tải Word'}
      </button>
      {doneNote && <p style={{ fontSize: 12.5, marginTop: 8 }}>{doneNote}</p>}
    </div>
  )
}

// ============================================================
// KHỐI 2 — Gạch chân đáp án theo file mẫu — tải về file Word
// ============================================================
function UnderlineWordTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [working, setWorking] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)

  async function handleRun() {
    setWorking(true)
    onError(null)
    setDoneNote(null)
    try {
      const raw = await loadRawDocx(file)
      const { underlineTargets } = await autoDetectCorrectRawParagraphs(raw.paragraphs)
      if (underlineTargets.length === 0) {
        setDoneNote('⚠ Không tìm được lời giải rõ ràng cho câu nào trong file để xác định đáp án — chưa gạch chân được câu nào.')
        return
      }
      const newParagraphs = applyUnderlineToParagraphs(raw.paragraphs, underlineTargets)
      const blob = await repackDocxWithParagraphs(raw.zip, raw.documentXml, newParagraphs.map((p) => p.xml))
      downloadBlob(blob, `${fileName || 'de'}-gach-chan-dap-an.docx`)
      setDoneNote(`✅ Đã gạch chân ${underlineTargets.length} đáp án và tải file Word về.`)
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi xử lý.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>🖊 Gạch chân đáp án theo file mẫu — tải về file Word</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        AI đọc lời giải từng câu để tự xác định và gạch chân đáp án đúng NGAY TRONG file Word gốc — giữ
        nguyên toàn bộ định dạng, font chữ, công thức, ảnh của đề, chỉ thêm gạch chân vào đúng phương án.
      </p>
      <button className="btn" onClick={handleRun} disabled={working}>
        {working ? '⏳ Đang xử lý...' : '🖊 Gạch chân & Tải Word'}
      </button>
      {doneNote && <p style={{ fontSize: 12.5, marginTop: 8 }}>{doneNote}</p>}
    </div>
  )
}

// ============================================================
// KHỐI 3 — Ghép đề với lời giải — tải về file Word
// ============================================================
function AttachSolutionWordTool({ file, fileName, onError }: { file: File; fileName: string; onError: (e: string | null) => void }) {
  const [working, setWorking] = useState(false)
  const [doneNote, setDoneNote] = useState<string | null>(null)

  async function handleRun() {
    setWorking(true)
    onError(null)
    setDoneNote(null)
    try {
      const raw = await loadRawDocx(file)

      // Xác định trước khi ghép — lúc này options/lời giải vẫn còn nguyên vị
      // trí gần câu hỏi gốc, tránh phải dò lại sau khi đã xáo trộn thứ tự.
      const { underlineTargets, shortAnswers } = await autoDetectCorrectRawParagraphs(raw.paragraphs)
      const underlined: RawParagraph[] = applyUnderlineToParagraphs(raw.paragraphs, underlineTargets)

      const shortAnswerMap = new Map(shortAnswers.map((s) => [s.number, s.answerText]))
      const merged = spliceAttachSolutions(underlined, shortAnswerMap)
      const blob = await repackDocxWithParagraphs(raw.zip, raw.documentXml, merged.map((p) => p.xml))
      downloadBlob(blob, `${fileName || 'de'}-co-loi-giai-gach-chan.docx`)
      setDoneNote(
        `✅ Đã ghép lời giải + gạch chân ${underlineTargets.length} đáp án + thêm ${shortAnswers.length} dòng "Đáp án:" cho câu trả lời ngắn, tải file Word về.`,
      )
    } catch (err: any) {
      onError(err.message || 'Có lỗi khi xử lý.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card" style={{ border: '1px solid #c7d2fe' }}>
      <h3>📎 Ghép đề với lời giải — tải về file Word</h3>
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Giữ nguyên toàn bộ đề gốc, chỉ di chuyển lời giải (kể cả khi đang tách riêng ở cuối file, đánh số lại
        từ đầu) về đúng ngay dưới câu hỏi tương ứng — không dựng lại nội dung, giữ nguyên định dạng gốc.
      </p>
      <button className="btn" onClick={handleRun} disabled={working}>
        {working ? '⏳ Đang xử lý...' : '📎 Ghép lời giải + Gạch chân đáp án'}
      </button>
      {doneNote && <p style={{ fontSize: 12.5, marginTop: 8 }}>{doneNote}</p>}
    </div>
  )
}

function renderQuestionOnly(b: QuestionBlock, color: string) {
  // Gạch chân hiển thị nhờ thẻ <u> nằm ngay trong nội dung dòng (đúng chỗ chữ
  // được gạch chân trong Word) — KHÔNG gạch cả dòng theo cờ true/false nữa.
  const elements: JSX.Element[] = []
  let optionBuffer: string[] = []
  let key = 0

  const flushOptions = () => {
    if (optionBuffer.length === 0) return
    elements.push(
      <div key={`opt-${key++}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', margin: '4px 0' }}>
        {optionBuffer.map((line, i) => (
          <div key={i} style={{ color }}>
            <MathRenderer html={line} />
          </div>
        ))}
      </div>,
    )
    optionBuffer = []
  }

  for (const line of b.questionLines) {
    if (isOptionLine(line)) {
      optionBuffer.push(line)
    } else {
      flushOptions()
      elements.push(
        <div key={`ln-${key++}`} style={{ color, margin: '4px 0' }}>
          <MathRenderer html={line} />
        </div>,
      )
    }
  }
  flushOptions()
  return elements
}
