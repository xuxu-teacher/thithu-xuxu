// ============================================================
// EDGE FUNCTION: classify-questions
// ============================================================
// Nhận một mảng câu hỏi (đã được docxParser.ts tách sẵn) và trả về, với
// MỖI câu: chủ đề (topic), mức độ nhận thức (difficulty theo 4 mức Bộ
// GDĐT: Nhận biết / Thông hiểu / Vận dụng / Vận dụng cao), và cờ
// needs_review nếu AI không đủ tự tin.
//
// Đây là bước NỀN cho tính năng "kho câu hỏi -> lọc theo ma trận đề" sau
// này — chưa đụng tới bảng `questions`/`exams` hiện tại, chỉ trả kết quả
// phân loại để giáo viên duyệt trước khi lưu vào kho.
//
// DEPLOY:
//   supabase functions deploy classify-questions
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// GỌI TỪ CLIENT (xem src/utils/classifyQuestions.ts):
//   supabase.functions.invoke('classify-questions', { body: { grade, topics, questions } })
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIFFICULTY_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as const

interface IncomingQuestion {
  key: string // id tạm để map kết quả trả về đúng câu hỏi
  content_html: string
  part: 'mcq' | 'true_false' | 'short_answer'
}

interface ClassifyRequestBody {
  grade: '10' | '11' | '12' | string
  // Danh sách chủ đề hợp lệ, thường lấy từ bảng `chapters` (title) của
  // đúng khối lớp — để AI CHỈ được chọn trong danh sách này, không tự bịa
  // tên chủ đề lệch với chương trình giáo viên đã soạn.
  topics: string[]
  questions: IncomingQuestion[]
}

interface Classification {
  key: string
  topic: string
  difficulty: (typeof DIFFICULTY_LEVELS)[number]
  needs_review: boolean
}

// Bỏ thẻ HTML + rút gọn khoảng trắng để prompt gọn, đỡ tốn token — AI chỉ
// cần đọc nội dung toán học/văn bản thô, không cần định dạng hiển thị.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Giới hạn số câu mỗi lần gọi API — kho đề có thể có hàng trăm câu, gộp
// hết vào 1 prompt vừa dễ vượt giới hạn token vừa khiến model kém chính
// xác hơn ở các câu cuối. 15 câu/lần là điểm cân bằng hợp lý.
const BATCH_SIZE = 15

async function classifyBatch(
  batch: IncomingQuestion[],
  grade: string,
  topics: string[],
  apiKey: string,
): Promise<Classification[]> {
  const questionsBlock = batch
    .map((q, i) => `[${i}] (dạng: ${q.part})\n${stripHtml(q.content_html)}`)
    .join('\n\n')

  const systemPrompt = `Bạn là giáo viên Toán THPT (Việt Nam, chương trình GDPT 2018) đang phân loại câu hỏi vào kho đề.
Khối lớp: ${grade}.
Danh sách chủ đề HỢP LỆ (chỉ được chọn đúng một tên trong danh sách này, chép lại y nguyên, không bịa thêm):
${topics.map((t) => `- ${t}`).join('\n')}

Mức độ nhận thức (chọn đúng một trong bốn, theo đúng thang của Bộ GDĐT):
- Nhận biết: nhắc lại định nghĩa/công thức, tính toán trực tiếp một bước.
- Thông hiểu: áp dụng công thức/định lý quen thuộc, biến đổi vài bước.
- Vận dụng: kết hợp nhiều kiến thức, cần lập luận hoặc mô hình hóa.
- Vận dụng cao: bài toán lạ, nhiều bước biến đổi phức tạp, hoặc liên hệ thực tế đòi hỏi sáng tạo.

Với mỗi câu hỏi được đánh số [0], [1], ... hãy trả về đúng một dòng JSON, không giải thích thêm, không markdown, đúng định dạng mảng JSON sau:
[{"i":0,"topic":"...","difficulty":"...","needs_review":false}, ...]

"needs_review" = true nếu câu hỏi mơ hồ, thiếu ngữ cảnh, hoặc bạn không chắc chắn về chủ đề/mức độ.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // Haiku là đủ chính xác cho việc gán chủ đề/mức độ (không cần suy luận sâu
      // như giải toán) và rẻ hơn nhiều so với Sonnet — phù hợp khi phân loại
      // hàng trăm câu mỗi lần tải kho đề. Đổi sang 'claude-sonnet-5' nếu thấy
      // AI phân loại sai nhiều và cần độ chính xác cao hơn.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: questionsBlock }],
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API lỗi (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const rawText: string = (data.content ?? [])
    .map((block: { type: string; text?: string }) => (block.type === 'text' ? block.text : ''))
    .join('')

  // Model đôi khi bọc JSON trong ```json ... ``` dù đã dặn không markdown —
  // cắt bỏ cho chắc trước khi parse.
  const cleaned = rawText.replace(/```json|```/g, '').trim()

  let parsed: Array<{ i: number; topic: string; difficulty: string; needs_review: boolean }>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Không parse được -> đánh dấu cả batch cần rà lại thủ công thay vì
    // làm hỏng toàn bộ request.
    return batch.map((q) => ({
      key: q.key,
      topic: topics[0] ?? '',
      difficulty: 'Thông hiểu',
      needs_review: true,
    }))
  }

  return batch.map((q, i) => {
    const item = parsed.find((p) => p.i === i)
    const difficulty = DIFFICULTY_LEVELS.includes(item?.difficulty as any)
      ? (item!.difficulty as Classification['difficulty'])
      : 'Thông hiểu'
    const topic = item && topics.includes(item.topic) ? item.topic : topics[0] ?? ''
    return {
      key: q.key,
      topic,
      difficulty,
      needs_review: item ? Boolean(item.needs_review) || topic !== item.topic : true,
    }
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chưa cấu hình ANTHROPIC_API_KEY trên Supabase.' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const body: ClassifyRequestBody = await req.json()
    if (!body.questions?.length || !body.topics?.length) {
      return new Response(JSON.stringify({ error: 'Thiếu questions hoặc topics.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const batches: IncomingQuestion[][] = []
    for (let i = 0; i < body.questions.length; i += BATCH_SIZE) {
      batches.push(body.questions.slice(i, i + BATCH_SIZE))
    }

    // Chạy tuần tự (không Promise.all) để tránh dồn dập request cùng lúc
    // vượt rate limit của API key khi kho đề lớn (vài trăm câu).
    const results: Classification[] = []
    for (const batch of batches) {
      const batchResult = await classifyBatch(batch, body.grade, body.topics, apiKey)
      results.push(...batchResult)
    }

    return new Response(JSON.stringify({ classifications: results }), {
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
