// ============================================================
// EDGE FUNCTION: classify-questions
// ============================================================
// Nhận một mảng câu hỏi (đã được docxParser.ts tách sẵn) và trả về, với
// MỖI câu: KHỐI LỚP (10/11/12), chủ đề (topic, theo đúng chương của khối
// đó), mức độ nhận thức (Nhận biết / Thông hiểu / Vận dụng / Vận dụng
// cao), và cờ needs_review nếu AI không đủ tự tin.
//
// Khác bản trước: KHÔNG còn nhận sẵn "khối lớp" từ giáo viên nữa — AI tự
// suy ra khối lớp từ nội dung câu hỏi (dựa vào chương trình SGK Toán Kết
// nối tri thức 10/11/12), để giáo viên không phải tự chọn khối trước khi
// tải file lên (một file có thể lẫn câu nhiều khối khác nhau).
//
// DEPLOY:
//   supabase functions deploy classify-questions
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// GỌI TỪ CLIENT (xem src/utils/classifyQuestions.ts):
//   supabase.functions.invoke('classify-questions', { body: { curriculum, questions } })
//   trong đó curriculum: { "10": string[], "11": string[], "12": string[] }
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DIFFICULTY_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'] as const
const GRADES = ['10', '11', '12'] as const

interface IncomingQuestion {
  key: string // id tạm để map kết quả trả về đúng câu hỏi
  content_html: string
  part: 'mcq' | 'true_false' | 'short_answer'
}

interface ClassifyRequestBody {
  // Toàn bộ chủ đề của cả 3 khối, để AI tự chọn đúng khối + đúng chủ đề
  // trong khối đó — không giới hạn sẵn theo 1 khối như bản trước.
  curriculum: Record<'10' | '11' | '12', string[]>
  questions: IncomingQuestion[]
}

interface Classification {
  key: string
  grade: (typeof GRADES)[number]
  topic: string
  difficulty: (typeof DIFFICULTY_LEVELS)[number]
  needs_review: boolean
}

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

function buildCurriculumBlock(curriculum: ClassifyRequestBody['curriculum']): string {
  return GRADES.map(
    (g) => `Khối ${g}:\n${(curriculum[g] || []).map((t) => `  - ${t}`).join('\n')}`,
  ).join('\n\n')
}

async function classifyBatch(
  batch: IncomingQuestion[],
  curriculum: ClassifyRequestBody['curriculum'],
  apiKey: string,
): Promise<Classification[]> {
  const questionsBlock = batch
    .map((q, i) => `[${i}] (dạng: ${q.part})\n${stripHtml(q.content_html)}`)
    .join('\n\n')

  const systemPrompt = `Bạn là giáo viên Toán THPT (Việt Nam, chương trình GDPT 2018, SGK Kết nối tri thức) đang phân loại câu hỏi vào kho đề dùng chung cho cả 3 khối 10, 11, 12.

Với MỖI câu hỏi, xác định:
1. KHỐI LỚP (10, 11, hoặc 12) — dựa vào nội dung kiến thức câu hỏi thuộc chương trình khối nào.
2. CHỦ ĐỀ — chỉ được chọn đúng một tên trong danh sách chương của ĐÚNG khối vừa xác định ở dưới đây, chép lại y nguyên, không bịa thêm, không lấy chủ đề của khối khác:

${buildCurriculumBlock(curriculum)}

3. MỨC ĐỘ NHẬN THỨC (chọn đúng một trong bốn, theo đúng thang của Bộ GDĐT):
- Nhận biết: nhắc lại định nghĩa/công thức, tính toán trực tiếp một bước.
- Thông hiểu: áp dụng công thức/định lý quen thuộc, biến đổi vài bước.
- Vận dụng: kết hợp nhiều kiến thức, cần lập luận hoặc mô hình hóa.
- Vận dụng cao: bài toán lạ, nhiều bước biến đổi phức tạp, hoặc liên hệ thực tế đòi hỏi sáng tạo.

Với mỗi câu hỏi được đánh số [0], [1], ... hãy trả về đúng một dòng JSON, không giải thích thêm, không markdown, đúng định dạng mảng JSON sau:
[{"i":0,"grade":"10","topic":"...","difficulty":"...","needs_review":false}, ...]

"needs_review" = true nếu câu hỏi mơ hồ, thiếu ngữ cảnh, hoặc bạn không chắc chắn về khối/chủ đề/mức độ.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // Haiku là đủ chính xác cho việc gán khối/chủ đề/mức độ (không cần suy luận sâu
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

  const cleaned = rawText.replace(/```json|```/g, '').trim()

  let parsed: Array<{ i: number; grade: string; topic: string; difficulty: string; needs_review: boolean }>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Không parse được -> đánh dấu cả batch cần rà lại thủ công thay vì
    // làm hỏng toàn bộ request. Mặc định khối 10 chỉ là chỗ giữ trống,
    // giáo viên rà lại sẽ sửa đúng ở bước duyệt.
    return batch.map((q) => ({
      key: q.key,
      grade: '10',
      topic: curriculum['10']?.[0] ?? '',
      difficulty: 'Thông hiểu',
      needs_review: true,
    }))
  }

  return batch.map((q, i) => {
    const item = parsed.find((p) => p.i === i)
    const grade = GRADES.includes(item?.grade as any) ? (item!.grade as Classification['grade']) : '10'
    const validTopics = curriculum[grade] || []
    const difficulty = DIFFICULTY_LEVELS.includes(item?.difficulty as any)
      ? (item!.difficulty as Classification['difficulty'])
      : 'Thông hiểu'
    const topicOk = item ? validTopics.includes(item.topic) : false
    const topic = topicOk ? item!.topic : validTopics[0] ?? ''
    return {
      key: q.key,
      grade,
      topic,
      difficulty,
      needs_review: item ? Boolean(item.needs_review) || !topicOk : true,
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
    if (!body.questions?.length || !body.curriculum) {
      return new Response(JSON.stringify({ error: 'Thiếu questions hoặc curriculum.' }), {
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
      const batchResult = await classifyBatch(batch, body.curriculum, apiKey)
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
