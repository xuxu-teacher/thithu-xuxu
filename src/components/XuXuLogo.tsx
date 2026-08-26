interface Props {
  size?: number
  className?: string
}

/**
 * Mascot "Cô giáo Xu Xu" — tóc ngắn ngang vai, trẻ trung, phong cách vector
 * phẳng đáng yêu, dùng làm logo xuyên suốt hệ thống (Topbar, trang chủ).
 */
export default function XuXuLogo({ size = 40, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="50" cy="50" r="48" fill="#FDE68A" />
      <circle cx="50" cy="50" r="48" fill="url(#xuxu-bg)" />
      <defs>
        <linearGradient id="xuxu-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBCFE8" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>

      {/* Tóc phía sau (bob ngắn) */}
      <path
        d="M28 46 C28 28 38 16 50 16 C62 16 72 28 72 46 L72 60 C72 64 68 66 66 62 C64 68 60 70 58 66 L58 70 C58 74 42 74 42 70 L42 66 C40 70 36 68 34 62 C32 66 28 64 28 60 Z"
        fill="#3B2A20"
      />

      {/* Khuôn mặt */}
      <ellipse cx="50" cy="52" rx="19" ry="21" fill="#FFE0C2" />

      {/* Tóc mái */}
      <path
        d="M31 44 C31 30 39 21 50 21 C61 21 69 30 69 44 C69 38 63 33 50 33 C37 33 31 38 31 44 Z"
        fill="#3B2A20"
      />
      <path d="M31 44 C33 36 40 34 40 34 L36 46 Z" fill="#3B2A20" />
      <path d="M69 44 C67 36 60 34 60 34 L64 46 Z" fill="#3B2A20" />

      {/* Tóc ngắn 2 bên (đặc trưng bob) */}
      <path d="M29 44 C27 52 28 60 32 64 L34 50 Z" fill="#3B2A20" />
      <path d="M71 44 C73 52 72 60 68 64 L66 50 Z" fill="#3B2A20" />

      {/* Mắt */}
      <circle cx="43" cy="54" r="2.6" fill="#3B2A20" />
      <circle cx="57" cy="54" r="2.6" fill="#3B2A20" />

      {/* Má hồng */}
      <circle cx="38" cy="60" r="3.5" fill="#FCA5A5" opacity="0.6" />
      <circle cx="62" cy="60" r="3.5" fill="#FCA5A5" opacity="0.6" />

      {/* Miệng cười */}
      <path d="M45 62 Q50 67 55 62" stroke="#B45309" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Cổ áo blazer trẻ trung */}
      <path d="M32 92 C32 78 40 72 50 72 C60 72 68 78 68 92 Z" fill="#7C3AED" />
      <path d="M42 74 L50 84 L58 74 L54 90 L46 90 Z" fill="#F5F3FF" />
      <circle cx="50" cy="70" r="3" fill="#FBBF24" />
    </svg>
  )
}
