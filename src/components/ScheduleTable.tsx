import { TeacherScheduleRow } from '../types'

const DAYS: { key: keyof Pick<TeacherScheduleRow, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>; label: string }[] = [
  { key: 'mon', label: 'Thứ 2' },
  { key: 'tue', label: 'Thứ 3' },
  { key: 'wed', label: 'Thứ 4' },
  { key: 'thu', label: 'Thứ 5' },
  { key: 'fri', label: 'Thứ 6' },
  { key: 'sat', label: 'Thứ 7' },
  { key: 'sun', label: 'CN' },
]

export default function ScheduleTable({
  rows,
  editable,
  onChangeCell,
  onChangeLabel,
  onDeleteRow,
}: {
  rows: TeacherScheduleRow[]
  editable: boolean
  onChangeCell?: (rowId: string, day: string, value: string) => void
  onChangeLabel?: (rowId: string, value: string) => void
  onDeleteRow?: (rowId: string) => void
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="list">
        <thead>
          <tr>
            <th>Lớp</th>
            {DAYS.map((d) => (
              <th key={d.key}>{d.label}</th>
            ))}
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                {editable ? (
                  <input
                    style={{ minWidth: 90, marginBottom: 0 }}
                    value={r.class_label}
                    onChange={(e) => onChangeLabel?.(r.id, e.target.value)}
                  />
                ) : (
                  <b>{r.class_label}</b>
                )}
              </td>
              {DAYS.map((d) => (
                <td key={d.key}>
                  {editable ? (
                    <input
                      style={{ minWidth: 90, marginBottom: 0, fontSize: 12.5 }}
                      value={(r[d.key] as string) || ''}
                      placeholder="—"
                      onChange={(e) => onChangeCell?.(r.id, d.key, e.target.value)}
                    />
                  ) : (
                    r[d.key] || '—'
                  )}
                </td>
              ))}
              {editable && (
                <td>
                  <button type="button" className="btn danger" style={{ padding: '4px 8px' }} onClick={() => onDeleteRow?.(r.id)}>
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={editable ? 9 : 8} style={{ color: 'var(--muted)' }}>
                Chưa có dòng nào trong thời khóa biểu.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
