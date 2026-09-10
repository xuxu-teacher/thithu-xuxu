import JSZip from 'jszip'

// ============================================================
// ĐỌC BẢNG MA TRẬN ĐỀ TỪ FILE WORD (.docx)
// ============================================================
// Giáo viên thường có sẵn ma trận đề dạng bảng trong Word (không phải
// Excel) — đọc thẳng file .docx, tìm MỌI bảng (<w:tbl>) trong tài liệu,
// tách từng dòng (<w:tr>) thành các ô (<w:tc>), lấy text thô của từng ô.
// Không cần công thức/hình ảnh ở đây — ma trận chỉ có chữ và số.
// Dùng lại đúng kỹ thuật regex trên XML thô như docxParser.ts, không qua
// thư viện ngoài (mammoth...) để nhất quán với phần đọc đề thi.
// ============================================================

function stripTagsGetText(cellXml: string): string {
  const wtRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let text = ''
  let m: RegExpExecArray | null
  while ((m = wtRe.exec(cellXml))) {
    text += m[1]
  }
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim()
}

/** Trả về mảng các bảng, mỗi bảng là mảng các dòng, mỗi dòng là mảng text các ô. */
export function extractTablesFromDocxXml(documentXml: string): string[][][] {
  const tables: string[][][] = []
  const tblRe = /<w:tbl>([\s\S]*?)<\/w:tbl>/g
  let tblMatch: RegExpExecArray | null
  while ((tblMatch = tblRe.exec(documentXml))) {
    const tblXml = tblMatch[1]
    const rows: string[][] = []
    const trRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
    let trMatch: RegExpExecArray | null
    while ((trMatch = trRe.exec(tblXml))) {
      const trXml = trMatch[1]
      const cells: string[] = []
      const tcRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
      let tcMatch: RegExpExecArray | null
      while ((tcMatch = tcRe.exec(trXml))) {
        cells.push(stripTagsGetText(tcMatch[1]))
      }
      if (cells.length > 0) rows.push(cells)
    }
    if (rows.length > 0) tables.push(rows)
  }
  return tables
}

/**
 * Đọc file .docx, trả về TẤT CẢ các bảng tìm được (mỗi bảng là mảng dòng,
 * mỗi dòng là mảng text các ô) — để nơi gọi tự bỏ dòng tiêu đề CỦA TỪNG
 * BẢNG rồi map cột (Chủ đề | Mức độ | Dạng câu | Số câu) giống hệt cách
 * xử lý file Excel, dùng chung logic map cột ở MatrixFileImport.tsx.
 */
export async function parseMatrixWordFile(file: File): Promise<string[][][]> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('Không tìm thấy document.xml — file Word có thể bị hỏng.')

  const tables = extractTablesFromDocxXml(documentXml)
  if (tables.length === 0) {
    throw new Error('Không tìm thấy bảng nào trong file Word — ma trận đề cần được trình bày dưới dạng bảng (Insert > Table).')
  }
  return tables
}
