export interface TextItemLike {
  str: string
  transform: number[]
  width: number
}

/** Ghép các mảnh chữ của một trang PDF thành từng dòng theo toạ độ (trên → dưới, trái → phải). */
export function itemsToLines(items: TextItemLike[]): string[] {
  const rows: { y: number; items: TextItemLike[] }[] = []
  for (const it of items) {
    if (!it.str) continue
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
    if (!row) {
      row = { y, items: [] }
      rows.push(row)
    }
    row.items.push(it)
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    r.items.sort((a, b) => a.transform[4] - b.transform[4])
    let line = ''
    let lastEnd: number | null = null
    for (const it of r.items) {
      const x = it.transform[4]
      if (lastEnd !== null && x - lastEnd > 1.5 && !line.endsWith(' ') && !it.str.startsWith(' ')) line += ' '
      line += it.str
      lastEnd = x + it.width
    }
    return line.replace(/\s+/g, ' ').trim()
  })
}
