import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabaseClient] Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Tạo file .env dựa trên .env.example và điền thông tin project Supabase của bạn.'
  )
}

export const supabase = createClient(url, anonKey)
