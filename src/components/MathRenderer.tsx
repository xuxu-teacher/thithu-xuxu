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
    if (!ref.current) return
    if (lastValue.current === html) return
    ref.current.innerHTML = html
    lastValue.current = html

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
