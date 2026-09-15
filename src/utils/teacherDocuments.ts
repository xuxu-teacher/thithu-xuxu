import { supabase } from '../lib/supabaseClient'
import { TeacherDocument } from '../types'

export async function uploadTeacherDocument(
  file: File,
  teacherId: string,
  category: string,
  note?: string,
): Promise<void> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${teacherId}/${category}/${Date.now()}-${safeName}`

  const { error: upErr } = await supabase.storage.from('teacher-docs').upload(path, file, { upsert: false })
  if (upErr) throw new Error(`Tải file lên thất bại: ${upErr.message}`)

  const { error: dbErr } = await supabase.from('teacher_documents').insert({
    teacher_id: teacherId,
    category,
    file_name: file.name,
    storage_path: path,
    note: note || null,
  })
  if (dbErr) throw dbErr
}

export async function listTeacherDocuments(teacherId: string): Promise<TeacherDocument[]> {
  const { data, error } = await supabase
    .from('teacher_documents')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as TeacherDocument[]
}

/** Bucket private — cần link tạm thời (signed URL) để tải/xem, không có link công khai cố định. */
export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('teacher-docs').createSignedUrl(storagePath, 60 * 10) // 10 phút
  if (error) throw new Error(`Không tạo được link tải: ${error.message}`)
  return data.signedUrl
}

export async function deleteTeacherDocument(id: string, storagePath: string): Promise<void> {
  await supabase.storage.from('teacher-docs').remove([storagePath])
  const { error } = await supabase.from('teacher_documents').delete().eq('id', id)
  if (error) throw error
}
