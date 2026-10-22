import { useState, type FormEvent } from 'react'

// One editable section of a dealer page. Shows the values; with `canEdit`, an Edit button
// turns it into a form. Save sends only the fields that changed, plus an optional reason
// that is recorded with the change. Validation messages from the server appear in the form.

export type Field = {
  key: string
  label: string
  type: 'text' | 'number' | 'checkbox' | 'select'
  options?: Array<{ value: string; label: string }>
  help?: string
  // How the value reads when not editing (defaults to the raw value, or "—").
  show?: (value: unknown) => string
}

type Props = {
  title: string
  description?: string
  fields: Field[]
  values: Record<string, unknown>
  canEdit: boolean
  onSave: (changes: Record<string, unknown>, reason: string) => Promise<void>
  extraActions?: React.ReactNode
}

const asInput = (field: Field, v: unknown): string | boolean => {
  if (field.type === 'checkbox') return Boolean(Number(v))
  return v == null ? '' : String(v)
}

export default function SectionForm({ title, description, fields, values, canEdit, onSave, extraActions }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string | boolean>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const start = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, asInput(f, values[f.key])])))
    setReason('')
    setError('')
    setEditing(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const changes: Record<string, unknown> = {}
    for (const f of fields) {
      const before = asInput(f, values[f.key])
      if (draft[f.key] !== before) changes[f.key] = draft[f.key]
    }
    if (!Object.keys(changes).length) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(changes, reason)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel section-card">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {canEdit && !editing ? (
          <div className="section-actions">
            {extraActions}
            <button type="button" className="btn btn-secondary" onClick={start}>
              Edit
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <form className="field-grid" onSubmit={submit}>
          {fields.map((f) => (
            <label key={f.key} className={f.type === 'checkbox' ? 'check-field' : ''}>
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={Boolean(draft[f.key])}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                />
              ) : null}
              <span>{f.label}</span>
              {f.type === 'text' || f.type === 'number' ? (
                <input
                  type={f.type}
                  step={f.type === 'number' ? 'any' : undefined}
                  value={String(draft[f.key] ?? '')}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
              ) : null}
              {f.type === 'select' ? (
                <select value={String(draft[f.key] ?? '')} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {f.help ? <small className="muted">{f.help}</small> : null}
            </label>
          ))}
          <label className="reason-field">
            <span>Reason for the change (optional, saved in the activity log)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Joseph approved a wider radius" />
          </label>
          {error ? <p className="error form-error">{error}</p> : null}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="kv">
          {fields.map((f) => {
            const v = values[f.key]
            const text = f.show ? f.show(v) : f.type === 'checkbox' ? (Number(v) ? 'On' : 'Off') : v == null || v === '' ? '—' : String(v)
            return (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>{text}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}
