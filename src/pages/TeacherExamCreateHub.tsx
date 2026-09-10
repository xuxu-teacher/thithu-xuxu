import { Link, useParams } from 'react-router-dom'

// ============================================================
// "TẠO ĐỀ THI" — điểm vào chung cho 2 cách tạo đề thi CHÍNH THỨC (có đợt
// thi, giờ mở/đóng cổng, giám sát chống gian lận, thống kê điểm sau khi
// thi) — khác với "Đề thi thử" (luyện tự do, không giới hạn số lần, ở
// mục riêng).
// ============================================================

export default function TeacherExamCreateHub() {
  const { classId } = useParams()

  return (
    <div className="container">
      <Link to={`/teacher/classes/${classId}`} className="btn secondary" style={{ marginBottom: 16, display: 'inline-flex' }}>
        ← Quay lại lớp
      </Link>

      <div className="card">
        <h2>🆕 Tạo đề thi</h2>
        <p style={{ fontSize: 13 }}>
          Đề thi tạo ở đây là đề thi CHÍNH THỨC — có đợt thi, giờ mở/đóng cổng, hệ thống tự giám sát học sinh
          rời tab lúc làm bài, và có trang thống kê điểm/xếp loại sau khi đóng cổng thi. Chọn 1 trong 2 cách
          bên dưới.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3>Phần 1 — Tải 1 đề Word có sẵn</h3>
          <p style={{ fontSize: 13 }}>
            Bạn đã soạn sẵn 1 đề hoàn chỉnh trong file Word (đề chung cho cả lớp, cùng 1 mã đề). Hệ thống tách
            câu, nhận đáp án theo gạch chân, tạo thành 1 đợt thi trực tuyến — cấu hình giờ mở/đóng cổng, cách
            chấm điểm, có thể yêu cầu học sinh hoàn thành đợt trước mới được thi đợt này.
          </p>
          <Link to={`/teacher/classes/${classId}/exams/new`} className="btn">
            Tải file Word →
          </Link>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3>Phần 2 — Sinh đề từ Kho câu hỏi (ma trận đề)</h3>
          <p style={{ fontSize: 13 }}>
            Dựng ma trận (chủ đề × mức độ × dạng câu × số lượng) — hoặc tải file Excel ma trận có sẵn — hệ
            thống tự rút ngẫu nhiên đúng số câu từ Kho câu hỏi để tạo đề, mỗi lần sinh có thể ra đề khác nhau.
            Cần đã tải câu hỏi vào <Link to="/teacher/question-bank">Kho câu hỏi</Link> từ trước.
          </p>
          <Link to={`/teacher/classes/${classId}/exams/new-from-matrix`} className="btn">
            Dựng ma trận →
          </Link>
        </div>
      </div>

      <div className="card" style={{ background: '#fafbfe' }}>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          💡 Sau khi đóng cổng thi, vào <Link to="/teacher/exams">Ngân hàng đề thi</Link> → "Thống kê" để xem
          điểm, xếp loại, và danh sách học sinh có dấu hiệu rời tab nhiều lần lúc làm bài (nghi vấn gian lận).
        </p>
      </div>
    </div>
  )
}
