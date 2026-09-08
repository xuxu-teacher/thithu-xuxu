import type { ClipboardEvent } from 'react'

/**
 * Đọc 1 file ảnh thành thẻ <img> nhúng base64 — dùng để chèn trực tiếp vào
 * nội dung câu hỏi/lời giải khi giáo viên dán (Ctrl+V) hoặc chọn ảnh từ máy,
 * ví dụ để thay thế 1 công thức bị lỗi bằng ảnh chụp màn hình công thức đúng.
 */
export function fileToImgTag(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(`<br/><img src="${reader.result}" style="max-width:100%" /><br/>`)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Kiểm tra sự kiện paste (Ctrl+V) có chứa ảnh trong clipboard không.
 * Nếu có, đọc ảnh và gọi onInsert(html) để chèn vào nội dung, đồng thời
 * chặn hành vi dán mặc định (tránh dán kèm text rác từ ảnh).
 */
export function handlePasteImage(
  e: ClipboardEvent<HTMLTextAreaElement>,
  onInsert: (imgHtml: string) => void
): boolean {
  const items = e.clipboardData?.items
  if (!items) return false
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        fileToImgTag(file).then(onInsert)
        return true
      }
    }
  }
  return false
}
