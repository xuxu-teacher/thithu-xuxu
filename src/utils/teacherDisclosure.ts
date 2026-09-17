import { supabase } from '../lib/supabaseClient'
import { TeacherDisclosure, TeacherScheduleRow } from '../types'

export async function getTeacherDisclosure(teacherId: string): Promise<TeacherDisclosure | null> {
  const { data, error } = await supabase.from('teacher_disclosure').select('*').eq('teacher_id', teacherId).maybeSingle()
  if (error) throw error
  return data as TeacherDisclosure | null
}

export async function saveTeacherDisclosure(disclosure: TeacherDisclosure): Promise<void> {
  const { error } = await supabase.from('teacher_disclosure').upsert({ ...disclosure, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function listScheduleRows(teacherId: string): Promise<TeacherScheduleRow[]> {
  const { data, error } = await supabase
    .from('teacher_schedule_rows')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('order_index')
  if (error) throw error
  return (data ?? []) as TeacherScheduleRow[]
}

export async function saveScheduleRow(row: Partial<TeacherScheduleRow> & { teacher_id: string }): Promise<TeacherScheduleRow> {
  const { data, error } = await supabase.from('teacher_schedule_rows').upsert(row).select().single()
  if (error) throw error
  return data as TeacherScheduleRow
}

export async function deleteScheduleRow(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_schedule_rows').delete().eq('id', id)
  if (error) throw error
}

// ---------- Phía học sinh (qua RPC, bypass RLS) ----------

export async function getDisclosureForClass(classId: string): Promise<TeacherDisclosure | null> {
  const { data, error } = await supabase.rpc('get_teacher_disclosure_for_class', { p_class_id: classId })
  if (error) throw error
  return (data as TeacherDisclosure) ?? null
}

export async function getScheduleForClass(classId: string): Promise<TeacherScheduleRow[]> {
  const { data, error } = await supabase.rpc('get_teacher_schedule_for_class', { p_class_id: classId })
  if (error) throw error
  return (data ?? []) as TeacherScheduleRow[]
}
