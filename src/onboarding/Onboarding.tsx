import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend, UnauthorizedError } from '../api'
import SectionForm, { type Field } from '../dealers/SectionForm'
import type { OnboardingForm, OnboardingStatus, ProcessResult } from './types'
import type { GroupRow } from '../reports/types'

// Onboarding: every dealer form in progress. A form is started here (New dealer) and either
// filled in by us, or sent to the dealer as a private link for their part. When it's
// complete, Process creates the dealer — switched off — and its page opens under Dealers.

type Props = {
  token: string
  canEdit: boolean
  onUnauthorized: (message: string) => void
  onOpenDealer: (slug: string) => void
}

const STATUS: Record<OnboardingStatus, { label: string; badge: string; explain: string }> = {
  draft: { label: 'Draft', badge: '', explain: 'Being filled in here. Send the dealer a link for their part, or fill it in yourself.' },
  invited: { label: 'Link sent', badge: 'status-testing', explain: 'The dealer has a private link and is filling in their part.' },
  submitted: { label: 'Ready to review', badge: 'status-active', explain: 'The dealer submitted their part. Check our settings, then Process.' },
  applied: { label: 'Processed', badge: 'good', explain: 'The dealer exists. Changes now happen on its dealer page.' },
  rejected: { label: 'Rejected', badge: 'bad', explain: 'Closed without creating a dealer.' },
}
const OPEN: OnboardingStatus[] = ['draft', 'invited', 'submitted']

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'

export default function Onboarding({ token, canEdit, onUnauthorized, onOpenDealer }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [forms, setForms] = useState<OnboardingForm[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', contact_email: '' })

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized(e.message)
      else setError(e instanceof Error ? e.message : 'Something went wrong.')
    },
    [onUnauthorized],
  )

  useEffect(() => {
    if (selected) return
    let live = true
    apiGet<OnboardingForm[]>('/onboarding', token)
      .then((rows) => live && setForms(rows))
      .catch((e) => live && handle(e))
    return () => {
      live = false
    }
  }, [selected, token, handle])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const form = await apiSend<OnboardingForm>('POST', '/onboarding', token, draft)
      setCreating(false)
      setDraft({ name: '', contact_email: '' })
      setSelected(form.id)
    } catch (e) {
      handle(e)
    }
  }

  if (selected) {
    return (
      <FormPage id={selected} token={token} canEdit={canEdit} onBack={() => setSelected(null)} onError={handle} onOpenDealer={onOpenDealer} />
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-desc">New dealers on their way in. Send a dealer a private link for their details, then process the form to create them.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
              New dealer
            </button>
          </div>
        ) : null}
      </header>

      {creating ? (
        <form className="panel inline-form new-form" onSubmit={create}>
          <label>
            <span>Dealership name</span>
            <input required value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Bastrop Ford" />
          </label>
          <label>
            <span>Dealer contact email (for their link; optional)</span>
            <input type="email" value={draft.contact_email} onChange={(e) => setDraft((d) => ({ ...d, contact_email: e.target.value }))} />
          </label>
          <button type="submit" className="btn btn-primary">
            Start form
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <section className="table-section">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dealer</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Link sent</th>
                <th>Submitted</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {(forms ?? []).map((f) => (
                <tr key={f.id} className="clickable" onClick={() => setSelected(f.id)}>
                  <td>
                    <button type="button" className="link-button" onClick={() => setSelected(f.id)}>
                      {String(f.name || `Form #${f.id}`)}
                    </button>
                    <div className="muted">{String(f.city_state || f.zip_code || '')}</div>
                  </td>
                  <td>
                    <span className={`badge ${STATUS[f.status].badge}`}>{STATUS[f.status].label}</span>
                  </td>
                  <td>{String(f.contact_name || f.contact_email || f.invite_email || '—')}</td>
                  <td>{f.invited_at ? when(f.invited_at) : '—'}</td>
                  <td>{f.submitted_at ? when(f.submitted_at) : '—'}</td>
                  <td>{when(f.updated_at)}</td>
                </tr>
              ))}
              {forms && !forms.length ? (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No forms yet. Start one with New dealer.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ one form

const DEALER_FIELDS: Field[] = [
  { key: 'name', label: 'Dealership name', type: 'text' },
  { key: 'address', label: 'Street address', type: 'text' },
  { key: 'zip_code', label: 'Rooftop ZIP', type: 'text' },
  { key: 'city_state', label: 'City, state (shown to sellers)', type: 'text' },
  { key: 'public_phone', label: 'Phone (shown to sellers)', type: 'text' },
  { key: 'public_url', label: 'Website (shown to sellers)', type: 'text' },
  { key: 'crm_vendor', label: 'CRM (eLead, VinSolutions…)', type: 'text' },
  { key: 'crm_ingest_email', label: 'CRM lead address', type: 'text', help: 'Where their CRM accepts ADF leads.' },
  { key: 'backup_email', label: 'Backup address', type: 'text' },
  { key: 'test_email', label: 'Their test inbox', type: 'text', help: 'Ours is always added too.' },
  { key: 'contact_name', label: 'Contact name', type: 'text' },
  { key: 'contact_role', label: 'Contact role', type: 'text' },
  { key: 'contact_email', label: 'Contact email', type: 'text' },
  { key: 'contact_phone', label: 'Contact phone', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'text' },
]

const OUR_FIELDS: Field[] = [
  { key: 'slug', label: 'Short name (in URLs and reports)', type: 'text', help: 'Lowercase letters, numbers and dashes.' },
  { key: 'service_radius_miles', label: 'Radius (miles)', type: 'number', help: 'Required before processing.' },
  { key: 'routing_weight', label: 'Priority weight', type: 'number' },
  { key: 'total_cap', label: 'Total cap', type: 'number', help: 'Empty means no cap.' },
  { key: 'monthly_cap', label: 'Monthly cap', type: 'number', help: 'Empty means no cap.' },
  { key: 'min_model_year_enabled', label: 'Only vehicles this year or newer', type: 'checkbox' },
  { key: 'min_model_year', label: 'Oldest model year accepted', type: 'number' },
  { key: 'max_mileage_enabled', label: 'Only vehicles at or under this mileage', type: 'checkbox' },
  { key: 'max_mileage', label: 'Highest mileage accepted', type: 'number' },
  { key: 'in_state_enabled', label: 'Only sellers in this state', type: 'checkbox' },
  { key: 'in_state', label: 'State', type: 'text' },
  { key: 'suppress_inspection', label: 'Skip vehicles that need an inspection', type: 'checkbox' },
  {
    key: 'vehicle_interest',
    label: 'ADF vehicle interest',
    type: 'select',
    options: ['sell', 'trade-in', 'buy', 'lease', 'test-drive'].map((v) => ({ value: v, label: v })),
  },
  { key: 'lead_type', label: 'ADF lead type tag', type: 'text', help: 'Empty leaves the tag out.' },
  { key: 'provider_service', label: 'ADF provider service', type: 'text' },
  { key: 'subject', label: 'ADF email subject', type: 'text' },
  { key: 'mileage_in_comments', label: 'Repeat mileage in ADF comments', type: 'checkbox' },
]

function FormPage({
  id,
  token,
  canEdit,
  onBack,
  onError,
  onOpenDealer,
}: {
  id: number
  token: string
  canEdit: boolean
  onBack: () => void
  onError: (e: unknown) => void
  onOpenDealer: (slug: string) => void
}) {
  const [form, setForm] = useState<OnboardingForm | null>(null)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [version, setVersion] = useState(0)
  const [link, setLink] = useState('')
  const [check, setCheck] = useState<ProcessResult | null>(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let live = true
    apiGet<OnboardingForm>(`/onboarding/${id}`, token)
      .then((f) => live && setForm(f))
      .catch((e) => live && onError(e))
    apiGet<GroupRow[]>('/groups', token)
      .then((rows) => live && setGroups(rows))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id, token, version, onError])

  const act = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setMessage('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setMessage(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy('')
    }
  }

  const save = async (changes: Record<string, unknown>) => {
    try {
      await apiSend('PATCH', `/onboarding/${id}`, token, changes)
      setCheck(null)
      reload()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      throw e
    }
  }

  if (!form) return <div className="page"><p className="empty-row">Loading…</p></div>
  const open = OPEN.includes(form.status)
  const editable = canEdit && open
  const s = STATUS[form.status]

  const sendInvite = () =>
    act('invite', async () => {
      const r = await apiSend<OnboardingForm & { invite_url: string }>('POST', `/onboarding/${id}/invite`, token, {})
      setLink(r.invite_url)
      reload()
    })
  const runCheck = () =>
    act('check', async () => {
      setCheck(await apiSend<ProcessResult>('POST', `/onboarding/${id}/process`, token, { dry_run: true }))
    })
  const process = () =>
    act('process', async () => {
      const r = await apiSend<ProcessResult>('POST', `/onboarding/${id}/process`, token, {})
      setCheck(r)
      if (r.ok) reload()
    })

  return (
    <div className="page">
      <button type="button" className="btn btn-quiet back-link" onClick={onBack}>
        All forms
      </button>
      <header className="page-head">
        <div>
          <h1 className="page-title">{String(form.name || `Form #${form.id}`)}</h1>
          <p className="page-desc">{s.explain}</p>
        </div>
      </header>

      <section className={`panel status-panel ${form.status === 'submitted' ? 'status-active' : form.status === 'invited' ? 'status-testing' : ''}`}>
        <div className="status-row">
          <div>
            <span className={`badge ${s.badge}`}>{s.label}</span>
            <p className="status-text">
              {form.status === 'invited' && form.invite_active
                ? `Link sent${form.invite_email ? ` to ${form.invite_email}` : ''}, expires ${when(form.invite_expires_at)}.`
                : form.status === 'invited'
                  ? 'The link has expired. Send a new one.'
                  : form.status === 'submitted'
                    ? `Submitted ${when(form.submitted_at)}.`
                    : form.status === 'rejected'
                      ? String(form.last_error || '')
                      : form.status === 'applied'
                        ? 'This form created a dealer.'
                        : 'Nothing sent yet.'}
            </p>
          </div>
          <div className="section-actions">
            {form.status === 'applied' && form.dealer_slug ? (
              <button type="button" className="btn btn-primary" onClick={() => onOpenDealer(String(form.dealer_slug))}>
                Open dealer
              </button>
            ) : null}
            {editable ? (
              <>
                {['draft', 'invited'].includes(form.status) ? (
                  <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={sendInvite}>
                    {form.status === 'invited' ? 'Send a new link' : 'Send dealer a link'}
                  </button>
                ) : null}
                {form.invite_active ? (
                  <button type="button" className="btn btn-quiet" disabled={!!busy}
                    onClick={() => act('revoke', async () => { await apiSend('POST', `/onboarding/${id}/revoke-invite`, token, {}); setLink(''); reload() })}>
                    Turn off link
                  </button>
                ) : null}
                <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={runCheck}>
                  Check
                </button>
                <button type="button" className="btn btn-primary" disabled={!!busy} onClick={process}>
                  {busy === 'process' ? 'Processing…' : 'Process'}
                </button>
                <button type="button" className="btn btn-quiet" disabled={!!busy} onClick={() => setRejecting((v) => !v)}>
                  Reject
                </button>
              </>
            ) : null}
          </div>
        </div>

        {link ? (
          <div className="invite-link">
            <p>
              <strong>Send this link to the dealer.</strong> It’s shown only now; sending a new link turns this one off.
            </p>
            <div className="copy-row">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-secondary" onClick={() => void navigator.clipboard?.writeText(link)}>
                Copy
              </button>
            </div>
          </div>
        ) : null}

        {rejecting ? (
          <form className="confirm" onSubmit={(e) => { e.preventDefault(); void act('reject', async () => { await apiSend('POST', `/onboarding/${id}/reject`, token, { reason }); setRejecting(false); reload() }) }}>
            <label>
              <span>Why it’s being closed (saved on the form)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-danger">Reject form</button>
              <button type="button" className="btn btn-quiet" onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </form>
        ) : null}

        {check ? (
          check.ok ? (
            check.dryRun ? (
              <p className="check good-check">Ready to process: everything a dealer needs is filled in.</p>
            ) : (
              <p className="check good-check">Dealer created, switched off. Open it to send test leads and activate.</p>
            )
          ) : (
            <div className="check bad-check">
              <strong>Not ready yet:</strong>
              <ul>
                {(check.errors ?? []).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )
        ) : null}
        {message ? <p className="error form-error">{message}</p> : null}
      </section>

      <div className="section-grid">
        <SectionForm title="From the dealer" description="What the dealer fills in through their link (or you, here)." fields={DEALER_FIELDS} values={form} canEdit={editable} onSave={save} askReason={false} />
        <SectionForm title="Our settings" description="Only we set these: what leads they get, and how the ADF is shaped." fields={[
            OUR_FIELDS[0],
            {
              key: 'group_id',
              label: 'Dealer group',
              type: 'select',
              options: [{ value: '', label: 'Independent (no group)' }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))],
              show: (v) => groups.find((g) => g.id === Number(v))?.name ?? 'Independent',
            },
            ...OUR_FIELDS.slice(1),
          ]} values={form} canEdit={editable} onSave={save} askReason={false} />
      </div>
    </div>
  )
}
