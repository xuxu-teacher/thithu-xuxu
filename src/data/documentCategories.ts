// ============================================================
// THƯ MỤC GIẤY TỜ SỔ SÁCH DẠY THÊM
// ============================================================
// Dựa theo Thông tư 29/2024/TT-BGDĐT (quy định về dạy thêm, học thêm),
// được sửa đổi bởi Thông tư 19/2026/TT-BGDĐT (hiệu lực từ 15/5/2026) —
// các nhóm giấy tờ cơ sở dạy thêm ngoài nhà trường cần có/công khai theo
// quy định. Đây là nơi TỔ CHỨC LƯU TRỮ file, không thay thế việc tự kiểm
// tra chính xác mẫu biểu với nhà trường/Sở GDĐT nơi bạn công tác — mỗi
// nơi có thể yêu cầu thêm chi tiết khác nhau.
// ============================================================

export interface DocCategory {
  key: string
  label: string
  description: string
}

export const DOCUMENT_CATEGORIES: DocCategory[] = [
  {
    key: 'business_registration',
    label: '📋 Đăng ký kinh doanh',
    description: 'Giấy chứng nhận đăng ký hộ kinh doanh/doanh nghiệp dạy thêm, giấy tờ pháp lý liên quan đến cơ sở dạy thêm ngoài nhà trường.',
  },
  {
    key: 'public_disclosure',
    label: '📢 Công khai thông tin dạy thêm',
    description: 'Thông báo tuyển sinh, danh sách người dạy, môn học, mức thu tiền, thời khóa biểu — theo quy định phải công khai rõ ràng.',
  },
  {
    key: 'contracts_consent',
    label: '📝 Hợp đồng & Đơn tự nguyện học thêm',
    description: 'Hợp đồng dịch vụ giáo dục với phụ huynh/học sinh, đơn xin học thêm trên tinh thần tự nguyện.',
  },
  {
    key: 'tuition_records',
    label: '💰 Sổ sách thu — chi học phí',
    description: 'Chứng từ thu tiền học phí, hóa đơn, sổ quỹ thu-chi minh bạch (thu qua tài khoản, không thu tiền ngoài sổ sách).',
  },
  {
    key: 'school_report',
    label: '🏫 Báo cáo với Hiệu trưởng / Sở GDĐT',
    description: 'Nếu đang là giáo viên biên chế/hợp đồng tại trường: báo cáo địa điểm, hình thức, thời gian dạy thêm ngoài nhà trường theo quy định.',
  },
  {
    key: 'other',
    label: '📑 Giấy tờ khác',
    description: 'Các giấy tờ khác chưa thuộc nhóm trên.',
  },
]

export function getCategoryLabel(key: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key)?.label || key
}
