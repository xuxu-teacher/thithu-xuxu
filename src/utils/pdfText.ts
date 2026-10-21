import { TextItemLike, itemsToLines } from './pdfLines'

export interface PdfTextResult {
  text: string
  pages: number
}

// Nạp pdf.js khi cần (chỉ trang Gán ID dùng) để không làm nặng các trang khác
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjsLib
}

export async function extractPdfText(file: File): Promise<PdfTextResult> {
  const pdfjsLib = await loadPdfjs()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjsLib.getDocument({ data })
  const doc = await task.promise
  const numPages = doc.numPages
  const pageTexts: string[] = []
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = (content.items as unknown[]).filter(
      (it): it is TextItemLike => typeof (it as TextItemLike).str === 'string'
    )
    pageTexts.push(itemsToLines(items).join('\n'))
  }
  await task.destroy()
  return { text: pageTexts.join('\n'), pages: numPages }
}
