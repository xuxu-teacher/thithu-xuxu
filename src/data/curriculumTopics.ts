// ============================================================
// CHỦ ĐỀ THEO SGK TOÁN "KẾT NỐI TRI THỨC VỚI CUỘC SỐNG" — 10, 11, 12
// ============================================================
// Danh sách cố định, lấy đúng theo tên chương trong sách giáo khoa hiện
// hành. Dùng làm danh sách "chủ đề" cho Kho câu hỏi và Ma trận đề — KHÔNG
// còn phụ thuộc việc giáo viên phải tự tạo "Chương" ở mục Bài giảng nữa.
//
// Nếu trường bạn dùng bộ sách khác (Cánh diều / Chân trời sáng tạo) hoặc
// muốn thêm/bớt chủ đề, chỉ cần sửa trực tiếp mảng tương ứng bên dưới.
// ============================================================

export const CURRICULUM_TOPICS: Record<'10' | '11' | '12', string[]> = {
  '10': [
    'Mệnh đề và tập hợp',
    'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    'Hệ thức lượng trong tam giác',
    'Vectơ',
    'Các số đặc trưng của mẫu số liệu không ghép nhóm',
    'Hàm số, đồ thị và ứng dụng',
    'Phương pháp tọa độ trong mặt phẳng',
    'Đại số tổ hợp',
    'Tính xác suất theo định nghĩa cổ điển',
  ],
  '11': [
    'Hàm số lượng giác và phương trình lượng giác',
    'Dãy số. Cấp số cộng và cấp số nhân',
    'Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm',
    'Quan hệ song song trong không gian',
    'Giới hạn. Hàm số liên tục',
    'Hàm số mũ và hàm số lôgarit',
    'Quan hệ vuông góc trong không gian',
    'Các quy tắc tính xác suất',
    'Đạo hàm',
  ],
  '12': [
    'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    'Vectơ và hệ trục tọa độ trong không gian',
    'Các số đặc trưng đo mức độ phân tán của mẫu số liệu ghép nhóm',
    'Nguyên hàm và tích phân',
    'Phương pháp tọa độ trong không gian',
    'Xác suất có điều kiện',
  ],
}

export function getCurriculumTopics(grade: '10' | '11' | '12'): string[] {
  return CURRICULUM_TOPICS[grade]
}
