import mammoth from 'mammoth'

/**
 * Đọc file .docx và trả về HTML.
 *
 * GHI CHÚ QUAN TRỌNG VỀ CÔNG THỨC MATHTYPE:
 * MathType chèn công thức vào Word dưới dạng đối tượng OLE/OMML. Trình duyệt
 * (và mammoth.js) không thể "hiểu" cấu trúc toán học này để vẽ lại công thức
 * đẹp như Word. Có 2 cách xử lý ổn định 100% khi triển khai web:
 *
 * 1) KHUYẾN NGHỊ: Trong Word, chọn công thức MathType -> phải chuột ->
 *    "Convert Equation Object" hoặc dùng MathType > Convert Equations >
 *    chuyển sang ảnh (Image), hoặc đơn giản là chụp ảnh công thức và chèn
 *    lại vào vị trí cũ dưới dạng Picture. Khi đó mammoth sẽ trích xuất được
 *    ảnh này ra <img> và hiển thị chính xác 100%, không lỗi font/ký hiệu.
 *
 * 2) Nếu người ra đề gõ công thức bằng LaTeX ngay trong Word (đặt trong cặp
 *    dấu $...$ cho công thức inline hoặc $$...$$ cho công thức khối), app
 *    sẽ tự nhận diện và render bằng KaTeX (xem components/MathRenderer.tsx)
 *    -> công thức sắc nét, không lỗi, tải nhanh.
 *
 * Hàm bên dưới giữ nguyên mọi ảnh (kể cả ảnh công thức, hình vẽ hình học...)
 * bằng cách nhúng base64 trực tiếp vào HTML, tránh việc ảnh bị vỡ link khi
 * tách câu hỏi ra khỏi file gốc.
 */
export async function docxFileToHtml(file: File): Promise<{ html: string; warnings: string[] }> {
  const arrayBuffer = await file.arrayBuffer()

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64')
        return { src: `data:${image.contentType};base64,${base64}` }
      }),
    }
  )

  return {
    html: result.value,
    warnings: result.messages.map((m) => m.message),
  }
}

/**
 * Tách HTML của cả đề thi thành từng câu hỏi dựa trên mốc "Câu N:" hoặc "Câu N."
 * Đây là cách tách đơn giản theo quy ước thường dùng của đề thi Việt Nam.
 * Giáo viên có thể chỉnh sửa lại từng câu sau khi tách trong giao diện soạn đề.
 */
export function splitQuestionsFromHtml(html: string): string[] {
  const marker = /(?=<p[^>]*>\s*(Câu|CÂU)\s*\d+[.:])/g
  const parts = html.split(marker).filter((p) => p && p.trim().length > 0)
  return parts.length > 0 ? parts : [html]
}
