import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend, UnauthorizedError } from '../api'
import SectionForm, { type Field } from './SectionForm'
import type { DealerDetail, DealerEvent, DealerListRow, DealerStatus, Recipient } from './types'

// The Dealers section: the list of every dealer, and a page per dealer where its settings
// can be changed and it can be switched on or off. Every change goes through the backend's
// dealer module, which validates it and records who made it and why.

type Props = {
  token: string
  canEdit: boolean
  onUnauthorized: (message: string) => void
}

const STATUS_LABEL: Record<DealerStatus, string> = { inactive: 'Inactive', testing: 'Testing', active: 'Active' }
const capText = (limit: number | null, used: number) => (limit == null ? 'No cap' : `${used} / ${limit}`)
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'

export default function Dealers({ token, canEdit, onUnauthorized }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [list, setList] = useState<DealerListRow[] | null>(null)
  const [error, setError] = useState('')

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized(e.message)
      else setError(e instanceof Error ? e.message : 'Could not load dealers.')
    },
    [onUnauthorized],
  )

  useEffect(() => {
    if (selected) return
    let live = true
    apiGet<DealerListRow[]>('/dealers', token)
      .then((rows) => live && setList(rows))
      .catch((e) => live && handle(e))
    return () => {
      live = false
    }
  }, [selected, token, handle])

  if (selected) {
    return <DealerPage slug={selected} token={token} canEdit={canEdit} onBack={() => setSelected(null)} onError={handle} />
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Dealers</h1>
          <p className="page-desc">Every dealer that can receive leads, whether it’s switched on, and how much of its cap is used.</p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <section className="table-section">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dealer</th>
                <th>Status</th>
                <th className="num">Radius</th>
                <th className="num">Leads this month</th>
                <th className="num">Total cap</th>
                <th className="num">Monthly cap</th>
                <th>CRM address</th>
              </tr>
            </thead>
            <tbody>
              {(list ?? []).map((d) => (
                <tr key={d.slug} className="clickable" onClick={() => setSelected(d.slug)}>
                  <td>
                    <button type="button" className="link-button" onClick={() => setSelected(d.slug)}>
                      {d.name}
                    </button>
                    <div className="muted">{d.city_state || d.zip_code}</div>
                  </td>
                  <td>
                    <span className={`badge status-${d.status}`}>{STATUS_LABEL[d.status]}</span>
                  </td>
                  <td className="num">{d.radius_miles == null ? '—' : `${d.radius_miles} mi`}</td>
                  <td className="num">{d.leads_this_month}</td>
                  <td className={`num ${d.total_cap != null && d.leads_total >= d.total_cap ? 'at-cap' : ''}`}>{capText(d.total_cap, d.leads_total)}</td>
                  <td className={`num ${d.monthly_cap != null && d.leads_this_month >= d.monthly_cap ? 'at-cap' : ''}`}>
                    {capText(d.monthly_cap, d.leads_this_month)}
                  </td>
                  <td className={d.crm_recipients ? '' : 'at-cap'}>{d.crm_recipients ? 'Set' : 'Missing'}</td>
                </tr>
              ))}
              {list && !list.length ? (
                <tr>
                  <td colSpan={7} className="empty-row">
                    No dealers yet. New dealers are added through Onboarding.
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

// ---------------------------------------------------------------- one dealer

function DealerPage({
  slug,
  token,
  canEdit,
  onBack,
  onError,
}: {
  slug: string
  token: string
  canEdit: boolean
  onBack: () => void
  onError: (e: unknown) => void
}) {
  const [d, setD] = useState<DealerDetail | null>(null)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)

  useEffect(() => {
    let live = true
    apiGet<DealerDetail>(`/dealers/${slug}`, token)
      .then((data) => live && setD(data))
      .catch((e) => live && onError(e))
    return () => {
      live = false
    }
  }, [slug, token, version, onError])

  // Saves one section, then reloads so the page shows exactly what the server stored.
  const save = (section: string) => async (changes: Record<string, unknown>, reason: string) => {
    try {
      await apiSend('PATCH', `/dealers/${slug}/${section}`, token, { ...changes, reason })
      reload()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      throw e
    }
  }

  if (!d) return <div className="page"><p className="empty-row">Loading…</p></div>
  const { dealer, routing, filters, adf, leads } = d

  const profileFields: Field[] = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'address', label: 'Street address', type: 'text' },
    { key: 'zip_code', label: 'Rooftop ZIP', type: 'text', help: 'Changing it doesn’t move the routing location; use “Use rooftop ZIP” under Routing.' },
    { key: 'city_state', label: 'City, state (shown to sellers)', type: 'text' },
    { key: 'public_phone', label: 'Phone (shown to sellers)', type: 'text' },
    { key: 'public_url', label: 'Website (shown to sellers)', type: 'text' },
    { key: 'crm_vendor', label: 'CRM', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'text' },
  ]
  const routingFields: Field[] = [
    { key: 'service_radius_miles', label: 'Radius (miles)', type: 'number', help: 'Leads farther than this from the rooftop never go to this dealer.', show: (v) => `${Number(v)} mi` },
    { key: 'routing_weight', label: 'Priority weight', type: 'number', help: 'Within a distance band, weight 2 gets about twice the leads of weight 1.' },
    { key: 'total_cap', label: 'Total cap', type: 'number', help: 'Lifetime leads. Empty means no cap.', show: (v) => (v == null ? 'No cap' : `${v} (${leads.total} used)`) },
    { key: 'monthly_cap', label: 'Monthly cap', type: 'number', help: 'Leads per calendar month. Empty means no cap.', show: (v) => (v == null ? 'No cap' : `${v} (${leads.this_month} used this month)`) },
    { key: 'lat', label: 'Latitude', type: 'number' },
    { key: 'lng', label: 'Longitude', type: 'number' },
  ]
  const filterFields: Field[] = [
    { key: 'min_model_year_enabled', label: 'Only vehicles this year or newer', type: 'checkbox' },
    { key: 'min_model_year', label: 'Oldest model year accepted', type: 'number' },
    { key: 'max_mileage_enabled', label: 'Only vehicles at or under this mileage', type: 'checkbox' },
    { key: 'max_mileage', label: 'Highest mileage accepted', type: 'number', show: (v) => (v == null ? '—' : `${Number(v).toLocaleString()} mi`) },
    { key: 'in_state_enabled', label: 'Only sellers in this state', type: 'checkbox' },
    { key: 'in_state', label: 'State', type: 'text' },
    { key: 'suppress_inspection', label: 'Skip vehicles that need an inspection (major accident or flood)', type: 'checkbox' },
  ]
  const adfFields: Field[] = [
    {
      key: 'vehicle_interest',
      label: 'Vehicle interest',
      type: 'select',
      options: ['sell', 'trade-in', 'buy', 'lease', 'test-drive'].map((v) => ({ value: v, label: v })),
    },
    { key: 'lead_type', label: 'Lead type tag (CDK/eLead)', type: 'text', help: 'Empty leaves the tag out.' },
    { key: 'provider_service', label: 'Provider service', type: 'text', help: 'The lead-source bucket the CRM sorts on.' },
    { key: 'subject', label: 'Email subject', type: 'text', help: 'Some CRMs match on this exact text.' },
    { key: 'vendor_email', label: 'Dealer email inside the ADF', type: 'text', help: 'Empty uses the CRM address.' },
    { key: 'mileage_in_comments', label: 'Repeat mileage in the comments', type: 'checkbox' },
  ]

  return (
    <div className="page">
      <button type="button" className="btn btn-quiet back-link" onClick={onBack}>
        All dealers
      </button>
      <header className="page-head">
        <div>
          <h1 className="page-title">{dealer.name}</h1>
          <p className="page-desc">
            {[dealer.city_state, dealer.crm_vendor && `CRM: ${dealer.crm_vendor}`, dealer.go_live_at && `live since ${when(dealer.go_live_at)}`]
              .filter(Boolean)
              .join('. ')}
          </p>
        </div>
      </header>

      <StatusPanel d={d} token={token} canEdit={canEdit} onChanged={reload} onError={onError} />

      <div className="section-grid">
        <SectionForm title="Routing" description="Which leads can reach this dealer." fields={routingFields} values={routing} canEdit={canEdit}
          onSave={save('routing')}
          extraActions={
            <button type="button" className="btn btn-quiet" onClick={() => save('routing')({ use_zip_location: true }, 'location reset to rooftop ZIP').catch(() => {})}>
              Use rooftop ZIP
            </button>
          }
        />
        <SectionForm title="Filters" description="Leads this dealer won’t take, even inside its radius." fields={filterFields} values={filters} canEdit={canEdit} onSave={save('filters')} />
        <SectionForm title="Dealer details" description="Who they are and what sellers are shown." fields={profileFields} values={dealer} canEdit={canEdit} onSave={save('profile')} />
        <SectionForm title="ADF format" description="How the lead email to their CRM is shaped." fields={adfFields} values={adf} canEdit={canEdit} onSave={save('adf')} />
      </div>

      <Recipients d={d} token={token} canEdit={canEdit} onChanged={reload} onError={onError} />
      <Contacts d={d} token={token} canEdit={canEdit} onChanged={reload} onError={onError} />
      <Activity events={d.events} />
    </div>
  )
}

// ------------------------------------------------------------ status & switch

const NEXT: Record<DealerStatus, Array<{ to: DealerStatus; label: string; kind: string; explain: string }>> = {
  inactive: [
    { to: 'testing', label: 'Start testing', kind: 'btn-secondary', explain: 'Test leads go only to the test inbox, never their CRM.' },
    { to: 'active', label: 'Activate', kind: 'btn-primary', explain: 'Routing starts sending them real leads.' },
  ],
  testing: [
    { to: 'active', label: 'Activate', kind: 'btn-primary', explain: 'Routing starts sending them real leads.' },
    { to: 'inactive', label: 'Deactivate', kind: 'btn-secondary', explain: 'They stop receiving anything.' },
  ],
  active: [{ to: 'inactive', label: 'Deactivate', kind: 'btn-danger', explain: 'They stop receiving leads immediately. Settings and history are kept.' }],
}

function StatusPanel({ d, token, canEdit, onChanged, onError }: { d: DealerDetail; token: string; canEdit: boolean; onChanged: () => void; onError: (e: unknown) => void }) {
  const [pending, setPending] = useState<DealerStatus | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const status = d.dealer.status
  const choice = NEXT[status].find((n) => n.to === pending)

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await apiSend('POST', `/dealers/${d.dealer.slug}/status`, token, { status: pending, reason })
      setPending(null)
      setReason('')
      onChanged()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not change the status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`panel status-panel status-${status}`}>
      <div className="status-row">
        <div>
          <span className={`badge status-${status}`}>{STATUS_LABEL[status]}</span>
          <p className="status-text">
            {status === 'active'
              ? 'Receiving routed leads.'
              : status === 'testing'
                ? 'Not routed to. Test leads go only to the test inbox.'
                : 'Receiving nothing.'}
          </p>
        </div>
        <div className="status-stats">
          <span><strong>{d.leads.this_month}</strong> leads this month</span>
          <span><strong>{d.leads.total}</strong> all time</span>
        </div>
        {canEdit && !pending ? (
          <div className="section-actions">
            {NEXT[status].map((n) => (
              <button key={n.to} type="button" className={`btn ${n.kind}`} onClick={() => { setPending(n.to); setError('') }}>
                {n.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {choice ? (
        <form className="confirm" onSubmit={confirm}>
          <p>
            <strong>{choice.label}?</strong> {choice.explain}
          </p>
          <label>
            <span>Reason (saved in the activity log)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. go-live approved by Joseph" />
          </label>
          {error ? <p className="error form-error">{error}</p> : null}
          <div className="form-actions">
            <button type="submit" className={`btn ${choice.kind === 'btn-danger' ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
              {busy ? 'Saving…' : choice.label}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

// ----------------------------------------------------------------- recipients

const KIND_LABEL: Record<Recipient['kind'], string> = { crm_ingest: 'CRM', backup: 'Backup', test: 'Test inbox' }

function Recipients({ d, token, canEdit, onChanged, onError }: { d: DealerDetail; token: string; canEdit: boolean; onChanged: () => void; onError: (e: unknown) => void }) {
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<Recipient['kind']>('crm_ingest')
  const [error, setError] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setError('')
    try {
      await fn()
      onChanged()
      return true
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not save.')
      return false
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await run(() => apiSend('POST', `/dealers/${d.dealer.slug}/recipients`, token, { email, kind }))) setEmail('')
  }

  return (
    <section className="panel section-card">
      <div className="section-head">
        <div>
          <h2>Where their leads go</h2>
          <p className="muted">Active dealers send to CRM and backup addresses; testing dealers send only to test inboxes.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr>
              <th>Address</th>
              <th>Used for</th>
              <th>State</th>
              {canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {d.recipients.map((r) => (
              <tr key={r.id}>
                <td className={r.active ? '' : 'muted'}>{r.email}</td>
                <td>{KIND_LABEL[r.kind]}</td>
                <td>{r.active ? <span className="badge good">On</span> : <span className="badge">Off</span>}</td>
                {canEdit ? (
                  <td className="num">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => run(() => apiSend('PATCH', `/dealers/${d.dealer.slug}/recipients/${r.id}`, token, { active: !r.active }))}
                    >
                      {r.active ? 'Switch off' : 'Switch on'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <form className="inline-form" onSubmit={add}>
          <label>
            <span>Add an address</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="leads@dealer.com" />
          </label>
          <label>
            <span>Used for</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Recipient['kind'])}>
              <option value="crm_ingest">CRM</option>
              <option value="backup">Backup</option>
              <option value="test">Test inbox</option>
            </select>
          </label>
          <button type="submit" className="btn btn-secondary">
            Add address
          </button>
        </form>
      ) : null}
      {error ? <p className="error form-error">{error}</p> : null}
    </section>
  )
}

// ------------------------------------------------------------------- contacts

function Contacts({ d, token, canEdit, onChanged, onError }: { d: DealerDetail; token: string; canEdit: boolean; onChanged: () => void; onError: (e: unknown) => void }) {
  const blank = { name: '', role: '', email: '', phone: '' }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')

  const run = async (body: Record<string, unknown>) => {
    setError('')
    try {
      await apiSend('POST', `/dealers/${d.dealer.slug}/contacts`, token, body)
      onChanged()
      return true
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not save.')
      return false
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await run({ ...form, is_primary: d.contacts.length === 0 })) setForm(blank)
  }

  return (
    <section className="panel section-card">
      <div className="section-head">
        <div>
          <h2>People</h2>
          <p className="muted">Who to call about this dealer: CRM admin, BDC manager, GM.</p>
        </div>
      </div>
      {d.contacts.length ? (
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {d.contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name || '—'} {c.is_primary ? <span className="badge good">Primary</span> : null}
                  </td>
                  <td>{c.role || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  {canEdit ? (
                    <td className="num nowrap">
                      {!c.is_primary ? (
                        <button type="button" className="btn btn-quiet" onClick={() => run({ id: c.id, is_primary: true })}>
                          Make primary
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-quiet" onClick={() => run({ id: c.id, remove: true })}>
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No contacts yet.</p>
      )}
      {canEdit ? (
        <form className="inline-form" onSubmit={add}>
          {(['name', 'role', 'email', 'phone'] as const).map((k) => (
            <label key={k}>
              <span>{k === 'role' ? 'Role' : k[0].toUpperCase() + k.slice(1)}</span>
              <input type={k === 'email' ? 'email' : 'text'} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </label>
          ))}
          <button type="submit" className="btn btn-secondary">
            Add person
          </button>
        </form>
      ) : null}
      {error ? <p className="error form-error">{error}</p> : null}
    </section>
  )
}

// ------------------------------------------------------------------- activity

const EVENT_LABEL: Record<string, string> = {
  created: 'Created from onboarding',
  status_changed: 'Status changed',
  routing_changed: 'Routing changed',
  filters_changed: 'Filters changed',
  profile_changed: 'Details changed',
  adf_config_changed: 'ADF format changed',
  recipients_changed: 'Addresses changed',
  contacts_changed: 'People changed',
  cap_hit: 'Reached a cap',
}

// "radius 25 → 30, total cap 100 → 120" from an event's detail.
const describe = (e: DealerEvent): string => {
  const detail = (typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail) as Record<string, unknown> | null
  if (!detail) return ''
  if (e.event === 'status_changed') return `${detail.from} → ${detail.to}`
  if (detail.changes && typeof detail.changes === 'object') {
    return Object.entries(detail.changes as Record<string, { from: unknown; to: unknown }>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.from ?? '—'} → ${v.to ?? '—'}`)
      .join(', ')
  }
  for (const key of ['added', 'activated', 'deactivated', 'removed', 'updated']) {
    if (detail[key]) {
      const v = detail[key] as Record<string, unknown>
      return `${key} ${[v.email, v.name, v.kind].filter(Boolean).join(' ')}`.trim()
    }
  }
  if (detail.caps) return `${(detail.caps as string[]).join(', ')} (lead #${detail.lead_id})`
  return ''
}

function Activity({ events }: { events: DealerEvent[] }) {
  return (
    <section className="panel section-card">
      <div className="section-head">
        <div>
          <h2>Recent activity</h2>
          <p className="muted">The last 10 changes, who made them, and why.</p>
        </div>
      </div>
      <ul className="activity">
        {events.map((e) => {
          const detail = (typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail) as Record<string, unknown> | null
          return (
            <li key={e.id}>
              <span className="activity-when">{when(e.created_at)}</span>
              <span className="activity-what">
                <strong>{EVENT_LABEL[e.event] || e.event}</strong> {describe(e)}
                {detail?.reason ? <span className="muted"> “{String(detail.reason)}”</span> : null}
              </span>
              <span className="muted activity-who">{e.actor}</span>
            </li>
          )
        })}
        {!events.length ? <li className="muted">Nothing yet.</li> : null}
      </ul>
    </section>
  )
}
