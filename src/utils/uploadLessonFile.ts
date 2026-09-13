import { supabase } from '../lib/supabaseClient'

/** Tải 1 file lên bucket "lesson-files" (Supabase Storage), trả về URL công khai để lưu vào cột link. */
export async function uploadLessonFile(file: File, teacherId: string): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${teacherId}/${Date.now()}-${safeName}`

  const { error } = await supabase.storage.from('lesson-files').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error(`Tải file lên thất bại: ${error.message}`)

  const { data } = supabase.storage.from('lesson-files').getPublicUrl(path)
  return data.publicUrl
}
