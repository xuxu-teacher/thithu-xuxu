// ============================================================
// EDGE FUNCTION: detect-correct-answers
// ============================================================
// Đọc lời giải của mỗi câu để tự xác định đáp án đúng — dùng cho công cụ
// "Tự động gạch chân đáp án" ở mục Chuẩn hóa Word.
//
// Quy ước: phương án chữ HOA (A/B/C/D) = trắc nghiệm 1 đáp án đúng.
// Phương án chữ thường (a/b/c/d) = Đúng/Sai, MỖI ý tự đúng/sai riêng.
// Câu không có lời giải kèm theo -> không đoán bừa, trả về rỗng.
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IncomingBlock {
  key: string
  questionText: string // nội dung câu hỏi (không gồm các dòng phương án)
  optionLines: string[] // các dòng phương án, ĐÚNG THỨ TỰ, kèm chữ cái ở đầu
  solutionText: string // toàn bộ lời giải/giải thích đi kèm — rỗng nếu không có
}

interface ResultItem {
  key: string
  correctIndices: number[] // chỉ số (0-based) trong optionLines cần gạch chân
}

const BATCH_SIZE = 10

async function detectBatch(batch: IncomingBlock[], apiKey: string): Promise<ResultItem[]> {
  const withSolution = batch.filter((b) => b.solutionText.trim().length > 0 && b.optionLines.length > 0)
  if (withSolution.length === 0) return batch.map((b) => ({ key: b.key, correctIndices: [] }))

  const block = withSolution
    .map((b, i) => {
      const isUpper = /^[A-D][.)]/.test(b.optionLines[0] || '')
      const kind = isUpper ? 'trắc nghiệm — CHỈ 1 đáp án đúng' : 'Đúng/Sai — MỖI ý tự đúng hoặc sai riêng'
      return `[${i}] (dạng: ${kind})\nCâu hỏi: ${b.questionText}\nCác phương án:\n${b.optionLines
        .map((o, oi) => `  (${oi}) ${o}`)
        .join('\n')}\nLời giải:\n${b.solutionText}`
    })
    .join('\n\n')

  const systemPrompt = `Bạn đọc lời giải của các câu hỏi Toán để xác định đáp án đúng, phục vụ việc tự động gạch chân đáp án trong đề.

Với câu TRẮC NGHIỆM (options chữ hoa A/B/C/D): xác định đúng 1 chỉ số phương án khớp với kết luận trong lời giải (thường có câu "Chọn X" hoặc "Vậy ... = X").
Với câu ĐÚNG/SAI (options chữ thường a/b/c/d): xét TỪNG ý một, dựa vào lời giải xem ý đó đúng hay sai — trả về chỉ số của TẤT CẢ các ý ĐÚNG (không trả ý sai).
Nếu lời giải không đủ rõ để kết luận chắc chắn, trả về mảng rỗng cho câu đó — KHÔNG đoán bừa.

Trả về đúng 1 mảng JSON, không giải thích thêm, không markdown, đúng định dạng:
[{"i":0,"correct":[2]}, {"i":1,"correct":[0,2,3]}, ...]
("correct" là mảng các chỉ số 0-based trong danh sách phương án của câu đó.)`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: block }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API lỗi (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const rawText: string = (data.content ?? [])
    .map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : ''))
    .join('')
  const cleaned = rawText.replace(/```json|```/g, '').trim()

  let parsed: Array<{ i: number; correct: number[] }>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return batch.map((b) => ({ key: b.key, correctIndices: [] }))
  }

  const withSolutionResults = withSolution.map((b, i) => {
    const item = parsed.find((p) => p.i === i)
    return { key: b.key, correctIndices: Array.isArray(item?.correct) ? item!.correct : [] }
  })
  const byKey = new Map(withSolutionResults.map((r) => [r.key, r]))
  return batch.map((b) => byKey.get(b.key) || { key: b.key, correctIndices: [] })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chưa cấu hình ANTHROPIC_API_KEY trên Supabase.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const body: { blocks: IncomingBlock[] } = await req.json()
    if (!body.blocks?.length) {
      return new Response(JSON.stringify({ error: 'Thiếu blocks.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const batches: IncomingBlock[][] = []
    for (let i = 0; i < body.blocks.length; i += BATCH_SIZE) batches.push(body.blocks.slice(i, i + BATCH_SIZE))

    const results: ResultItem[] = []
    for (const batch of batches) results.push(...(await detectBatch(batch, apiKey)))

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    })
  }
})
