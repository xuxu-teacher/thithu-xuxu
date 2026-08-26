import { useMemo } from 'react'
import katex from 'katex'

interface Props {
  html: string
  className?: string
}

/**
 * Nhận vào một đoạn HTML (đã convert từ Word, có thể chứa <img>, bảng, v.v.)
 * và render các đoạn công thức LaTeX đặt trong $...$ (inline) hoặc $$...$$
 * (block) thành công thức toán đẹp bằng KaTeX. Phần HTML còn lại giữ nguyên.
 */
export default function MathRenderer({ html, className }: Props) {
  const rendered = useMemo(() => renderMathInHtml(html), [html])
  return <div className={className} dangerouslySetInnerHTML={{ __html: rendered }} />
}

function renderMathInHtml(html: string): string {
  // Block: $$...$$
  let out = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true })
    } catch {
      return `<span class="math-error">${expr}</span>`
    }
  })

  // Inline: $...$
  out = out.replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr.trim(), { throwOnError: false, displayMode: false })
    } catch {
      return `<span class="math-error">${expr}</span>`
    }
  })

  return out
}
