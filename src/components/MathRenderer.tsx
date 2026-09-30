import { memo, useEffect, useRef } from 'react'

/**
 * Render HTML có chứa công thức LaTeX ($...$ / $$...$$) bằng MathJax 3.
 * MathJax được cấu hình và nạp sẵn trong index.html (giống cách dự án
 * "taodeword" tham khảo đã dùng) — xử lý tốt các cấu trúc phức tạp
 * (ma trận, hệ phương trình \begin{aligned}...\end{aligned}, phân số lồng
 * nhau...) tốt hơn KaTeX, và không phụ thuộc thêm thư viện nào ở phía app.
 */
declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>
      typesetClear?: (elements?: HTMLElement[]) => void
    }
  }
}

interface Props {
  html: string
  className?: string
  block?: boolean
}

function MathRenderer({ html, className = '', block = false }: Props) {
  const ref = useRef<HTMLDivElement | HTMLSpanElement>(null)
  const lastValue = useRef<string>('')

  useEffect(() => {
    // "overflow-wrap: anywhere" đặt trên khung ngoài (để chữ thường dài
    // không tràn khung) bị THỪA KẾ xuống bên trong công thức MathJax vẽ ra
    // — trình duyệt hiểu nhầm là được phép ngắt dòng ngay giữa cấu trúc
    // tử số/mẫu số của phân thức (mjx-frac xếp dọc), làm mẫu số bị "ngắt
    // xuyên" và co dúm lại. Công thức 1 dòng (không có cấu trúc xếp tầng)
    // không bị ảnh hưởng nên nhìn vẫn bình thường. Chỉ cần chèn 1 lần duy
    // nhất 1 quy tắc CSS loại trừ riêng phần tử MathJax khỏi việc kế thừa
    // này — không đụng gì đến thuộc tính overflowWrap của khung ngoài.
    if (!document.getElementById('mjx-overflow-fix')) {
      const style = document.createElement('style')
      style.id = 'mjx-overflow-fix'
      style.textContent =
        'mjx-container, mjx-container * { overflow-wrap: normal !important; word-break: normal !important; }'
      document.head.appendChild(style)
    }
  }, [])

  useEffect(() => {
    if (!ref.current) return
    if (lastValue.current === html) return
    ref.current.innerHTML = html
    lastValue.current = html

    // CÔNG CỤ TẠM THỜI để tìm đúng nguyên nhân lỗi công thức: mở Console
    // (F12) → gõ "allow pasting" nếu bị chặn → gõ window.__MJX_DEBUG__ = true
    // → Enter → tải lại trang. In thẳng ra Console (KHÔNG vẽ lên màn hình)
    // vì nhiều nơi trong app dựng công thức ở vùng ẩn ngoài màn hình (chỉ để
    // chụp ảnh xuất PDF) — vẽ lên màn hình ở những chỗ đó sẽ không bao giờ
    // nhìn thấy được. Chỉ in ra dòng nào CÓ vẻ là phân thức/công thức phức
    // tạp (chứa "frac" hoặc nhiều dấu \) để đỡ ngập Console vì quá nhiều dòng.
    if ((window as any).__MJX_DEBUG__ && /frac|\\\\[a-zA-Z]{3,}/.test(html)) {
      console.log('%c[MJX_DEBUG] mã gốc:', 'color:#ffd400;font-weight:bold', html)
    }

    const timer = window.setTimeout(() => {
      if (!ref.current || !window.MathJax?.typesetPromise) return
      window.MathJax.typesetClear?.([ref.current])
      window.MathJax.typesetPromise([ref.current]).catch((err) =>
        console.error('[MathRenderer] Lỗi khi render công thức:', err)
      )
    }, 10)
    return () => window.clearTimeout(timer)
  }, [html])

  const Tag = block ? 'div' : 'span'
  return (
    <Tag
      ref={ref as any}
      className={className}
      style={{ whiteSpace: block ? 'pre-wrap' : 'normal', overflowWrap: 'anywhere' }}
    />
  )
}

export default memo(MathRenderer)
