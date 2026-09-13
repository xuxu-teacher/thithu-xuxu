// ============================================================
// EDGE FUNCTION: generate-similar-questions
// ============================================================
// "Sinh đề tương tự" — giữ nguyên cấu trúc/lời văn của câu hỏi, chỉ đổi
// các SỐ LIỆU cụ thể (hệ số, dữ kiện cho trước) sang giá trị khác, rồi
// tính lại đáp án đúng cho đúng với số liệu mới. Dùng cho cả giáo viên
// (tạo đề luyện tập tương tự cả bài) và học sinh (luyện lại 1 câu vừa
// làm sai).
//
// Dùng Sonnet (không dùng Haiku như classify-questions) vì bước này cần
// suy luận/tính toán chính xác chứ không chỉ gán nhãn — đổi số sai hoặc
// tính sai đáp án mới sẽ tạo ra đề sai, rủi ro hơn nhiều so với gán nhầm
// chủ đề. Vẫn có thể sai với bài toán phức tạp — client luôn hiển thị
// cảnh báo "AI có thể tính sai, giáo viên/học sinh tự kiểm tra lại".
//
// DEPLOY: supabase functions deploy generate-similar-questions
// (dùng chung secret ANTHROPIC_API_KEY đã cấu hình cho classify-questions)
// ============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IncomingQuestion {
  key: string
  part: 'mcq' | 'true_false' | 'short_answer'
  content_html: string
  options: any // MCQOption[] | TrueFalseOption[] | null
  correct_answer: string | null
  explanation_html: string | null
}

interface VariantResult {
  key: string
  content_html: string
  options: any
  correct_answer: string | null
  explanation_html: string
  changed_numbers: boolean // false nếu câu không có số liệu để đổi (AI trả nguyên câu gốc)
}

const BATCH_SIZE = 8 // ít hơn classify-questions vì mỗi câu giờ cần AI "giải toán", output dài hơn nhiều

// Ảnh minh họa (hình vẽ, base64) không cần đưa cho AI xử lý — AI không thể
// "vẽ lại" hình theo số liệu mới, và base64 rất nặng (dễ vượt giới hạn độ
// dài request, làm câu có hình luôn báo lỗi). Thay bằng placeholder ngắn
// gọn trước khi gửi, dặn AI giữ nguyên placeholder, rồi khôi phục lại ảnh
// gốc theo đúng vị trí sau khi nhận kết quả.
function stripImages(html: string): { stripped: string; images: string[] } {
  const images: string[] = []
  const stripped = html.replace(/<img\b[^>]*>/g, (tag) => {
    images.push(tag)
    return `[HINH_${images.length}]`
  })
  return { stripped, images }
}

function restoreImages(html: string, images: string[]): string {
  let result = html
  images.forEach((tag, i) => {
    result = result.split(`[HINH_${i + 1}]`).join(tag)
  })
  return result
}

async function generateBatch(batch: IncomingQuestion[], apiKey: string): Promise<VariantResult[]> {
  // Tách ảnh ra khỏi từng câu trước khi đưa vào prompt — xem stripImages() ở trên.
  const imagesByIndex = batch.map((q) => stripImages(q.content_html).images)
  const strippedContents = batch.map((q) => stripImages(q.content_html).stripped)

  const questionsBlock = batch
    .map((q, i) => {
      const optionsText =
        q.part === 'mcq'
          ? `Đáp án (JSON): ${JSON.stringify(q.options)}\nĐáp án đúng hiện tại: ${q.correct_answer}`
          : q.part === 'true_false'
          ? `Các ý Đúng/Sai (JSON): ${JSON.stringify(q.options)}`
          : `Đáp án đúng hiện tại: ${q.correct_answer}`
      return `[${i}] (dạng: ${q.part})\nNội dung (HTML): ${strippedContents[i]}\n${optionsText}`
    })
    .join('\n\n')

  const systemPrompt = `Bạn là giáo viên Toán THPT Việt Nam đang tạo phiên bản "tương tự" của các câu hỏi cho học sinh luyện tập thêm.

QUY TẮC BẮT BUỘC cho mỗi câu:
1. GIỮ NGUYÊN cấu trúc câu hỏi, cách diễn đạt, chủ đề, độ khó, và định dạng HTML/LaTeX y hệt bản gốc.
2. BẮT BUỘC phải đổi số liệu — đây là mục đích chính, không được né tránh vì câu khó hay có nhiều số liệu liên quan nhau. changed_numbers CHỈ được phép là false trong trường hợp cực hiếm: câu hỏi lý thuyết/khái niệm thuần túy, không chứa bất kỳ con số định lượng nào (kể cả trong bảng). Còn lại, MỌI câu có số đều phải đổi, kể cả câu có bảng số liệu hay có hình vẽ kèm theo — không được lấy lý do "phức tạp" hay "có bảng/có hình" để giữ nguyên số liệu.
3. Sau khi đổi số, PHẢI tự giải lại từ đầu để tìm đáp án đúng mới, tính toán cẩn thận từng bước trước khi chốt kết quả — kể cả khi phải tính lại nhiều bước (trung bình, phương sai, tổng hợp bảng tần số...), không được bỏ qua bước tính lại vì ngại phức tạp.

QUY TẮC RIÊNG CHO CÂU CÓ BẢNG SỐ LIỆU (chứa thẻ <table>):
- Đổi các số trong CÁC Ô DỮ LIỆU định lượng (tần số, số lượng, giá trị đo được...) — mỗi ô đổi sang một số khác, hợp lý (số nguyên dương, không âm, không phá vỡ ý nghĩa bảng).
- Có thể giữ nguyên nhãn các khoảng/nhóm (ví dụ "[30;60)") nếu chúng chỉ là nhãn phân loại, hoặc đổi luôn cả mốc khoảng nếu muốn — miễn nhất quán với toàn bộ bảng và lời giải.
- Sau khi đổi, PHẢI tính lại toàn bộ các đại lượng liên quan (tổng, trung bình, phương sai, độ lệch chuẩn, giá trị đại diện...) đúng theo số liệu bảng mới, trình bày đủ các bước trong lời giải như bản gốc.

QUY TẮC RIÊNG CHO CÂU CÓ HÌNH VẼ (chứa placeholder [HINH_1], [HINH_2]...):
- Hình vẽ chỉ là minh họa hình dạng chung (tam giác, hình chóp, hệ trục...), KHÔNG thể hiện số liệu cụ thể trong ảnh — vì vậy KHÔNG bị hình vẽ giới hạn: mọi số liệu (độ dài cạnh, tọa độ điểm, số đo góc, tỉ số...) xuất hiện trong PHẦN CHỮ của câu hỏi vẫn phải được đổi bình thường như mọi câu khác, hình vẽ không cần và không thể chỉnh sửa lại — cứ giữ nguyên placeholder ở đúng vị trí, không liên quan gì đến việc đổi số trong chữ.
- Chỉ khi TOÀN BỘ số liệu của bài chỉ được ghi trên hình (không có bất kỳ con số nào trong phần chữ) thì mới được phép giữ nguyên (changed_numbers = false) — trường hợp này rất hiếm.

4. Với câu trắc nghiệm (mcq): phải tạo lại đúng 4 phương án (giữ nguyên key A/B/C/D), đáp án đúng khớp với kết quả tính lại, 3 phương án còn lại là các đáp án sai hợp lý (lỗi tính toán thường gặp), không được trùng giá trị với đáp án đúng.
5. Với câu Đúng/Sai (true_false): giữ đúng số ý và key (a/b/c/d), tính lại đúng/sai cho từng ý theo số liệu mới.
6. Với câu trả lời ngắn (short_answer): tính lại đáp số mới cho khớp số liệu mới.
7. Viết lại lời giải chi tiết (explanation_html) đầy đủ theo số liệu mới, giữ định dạng HTML/LaTeX như bản gốc.
8. Nếu trong đề có các placeholder dạng [HINH_1], [HINH_2]... — PHẢI giữ nguyên y hệt các placeholder này ở đúng vị trí, không xóa, không đổi số, không diễn giải thành chữ.

Với mỗi câu đánh số [0], [1], ... hãy trả về đúng một dòng JSON, KHÔNG giải thích thêm, KHÔNG markdown, đúng định dạng mảng JSON sau:
[{"i":0,"content_html":"...","options":..., "correct_answer":"...", "explanation_html":"...", "changed_numbers":true}, ...]

"options" giữ đúng kiểu dữ liệu như câu gốc (mảng {key,html} cho mcq, mảng {key,html,correct} cho true_false, null cho short_answer).`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 8192,
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

  let parsed: Array<{
    i: number
    content_html: string
    options: any
    correct_answer: string | null
    explanation_html: string
    changed_numbers: boolean
  }>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Không parse được -> trả nguyên câu gốc cho cả batch, đánh dấu chưa đổi số,
    // để không làm hỏng đề (thà giữ câu gốc còn hơn chèn dữ liệu rác).
    return batch.map((q) => ({
      key: q.key,
      content_html: q.content_html,
      options: q.options,
      correct_answer: q.correct_answer,
      explanation_html: q.explanation_html || '',
      changed_numbers: false,
    }))
  }

  return batch.map((q, i) => {
    const item = parsed.find((p) => p.i === i)
    if (!item) {
      return {
        key: q.key,
        content_html: q.content_html,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation_html: q.explanation_html || '',
        changed_numbers: false,
      }
    }
    return {
      key: q.key,
      // Khôi phục ảnh gốc đúng vị trí placeholder [HINH_n] AI đã giữ lại.
      content_html: restoreImages(item.content_html || q.content_html, imagesByIndex[i]),
      options: item.options ?? q.options,
      correct_answer: item.correct_answer ?? q.correct_answer,
      explanation_html: item.explanation_html || q.explanation_html || '',
      changed_numbers: Boolean(item.changed_numbers),
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

    const body: { questions: IncomingQuestion[] } = await req.json()
    if (!body.questions?.length) {
      return new Response(JSON.stringify({ error: 'Thiếu questions.' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      })
    }

    const batches: IncomingQuestion[][] = []
    for (let i = 0; i < body.questions.length; i += BATCH_SIZE) {
      batches.push(body.questions.slice(i, i + BATCH_SIZE))
    }

    const results: VariantResult[] = []
    for (const batch of batches) {
      results.push(...(await generateBatch(batch, apiKey)))
    }

    return new Response(JSON.stringify({ variants: results }), {
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
