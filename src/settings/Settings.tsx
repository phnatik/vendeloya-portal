import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend, UnauthorizedError } from '../api'
import SectionForm, { type Field } from '../dealers/SectionForm'
import type { DealerEvent, DealerStatus } from '../dealers/types'

// Global settings (system_settings): the routing switch, the distance bands, the default
// dealer, and who our emails come from. Any login can look; the admin role changes them.
// Every change is logged with who and why, like dealer changes.

type Mode = 'off' | 'shadow' | 'live'

type SettingsView = {
  settings: Record<string, unknown> & { routing_mode: Mode; default_dealer_id: number | null; updated_by: string | null; updated_at: string }
  modes: Record<Mode, string>
  default_dealer: { slug: string; name: string; status: DealerStatus } | null
  dealers: Array<{ id: number; slug: string; name: string; status: DealerStatus }>
  active_dealers: number
  events: DealerEvent[]
}

type Props = {
  token: string
  canEdit: boolean
  onUnauthorized: (message: string) => void
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'

const MODE_LABEL: Record<Mode, string> = { off: 'Off', shadow: 'Shadow', live: 'Live' }
// Reuses the dealer status colours: live reads like an active dealer, off like an inactive one.
const MODE_TONE: Record<Mode, DealerStatus> = { live: 'active', shadow: 'testing', off: 'inactive' }

export default function Settings({ token, canEdit, onUnauthorized }: Props) {
  const [view, setView] = useState<SettingsView | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized(e.message)
      else setError(e instanceof Error ? e.message : 'Could not load settings.')
    },
    [onUnauthorized],
  )

  useEffect(() => {
    let live = true
    apiGet<SettingsView>('/settings', token)
      .then((v) => live && setView(v))
      .catch((e) => live && handle(e))
    return () => {
      live = false
    }
  }, [token, version, handle])

  const reload = () => setVersion((v) => v + 1)

  if (!view) {
    return (
      <div className="page">
        {error ? <p className="error">{error}</p> : <p className="empty-row">Loading…</p>}
      </div>
    )
  }

  const save = async (changes: Record<string, unknown>, reason: string) => {
    try {
      await apiSend('PATCH', '/settings', token, { ...changes, reason })
      reload()
    } catch (e) {
      if (e instanceof UnauthorizedError) handle(e)
      throw e
    }
  }

  const dealerOptions = view.dealers.map((d) => ({ value: String(d.id), label: `${d.name}${d.status === 'active' ? '' : ` (${d.status})`}` }))

  const routingFields: Field[] = [
    {
      key: 'default_dealer_id',
      label: 'Default dealer',
      type: 'select',
      options: dealerOptions,
      help: 'Gets every lead while routing is off or in shadow.',
      show: (v) => view.dealers.find((d) => String(d.id) === String(v))?.name ?? '—',
    },
    { key: 'band_near_miles', label: 'Near band (miles)', type: 'number', help: 'Dealers this close compete first.' },
    { key: 'band_far_miles', label: 'Far band (miles)', type: 'number', help: 'Then dealers up to this far; beyond it, the rest.' },
    { key: 'default_test_recipient', label: 'Our test inbox', type: 'text', help: 'Added to every new dealer as a test address.' },
  ]

  const emailFields: Field[] = [
    { key: 'site_url', label: 'Our website', type: 'text', help: 'Used in the offer email and in every ADF.' },
    { key: 'customer_from_email', label: 'Customer emails come from', type: 'text' },
    { key: 'customer_from_name', label: 'Customer emails sender name', type: 'text' },
    { key: 'unsubscribe_url', label: 'Unsubscribe link', type: 'text', help: 'Empty sends customer emails without one.' },
    { key: 'offer_template_id', label: 'Offer email template (MailerSend)', type: 'text' },
    { key: 'inspection_template_id', label: 'Inspection email template (MailerSend)', type: 'text' },
    { key: 'lead_notify_to', label: 'New-lead alerts go to', type: 'text' },
    { key: 'adf_from_email', label: 'ADF leads come from', type: 'text', help: 'The address dealers’ CRMs receive leads from.' },
    { key: 'adf_provider_name', label: 'Our name in every ADF', type: 'text', help: 'The lead source dealers see.' },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-desc">
            The routing switch and the settings that apply to every dealer. Last changed by {view.settings.updated_by || '—'} on {when(view.settings.updated_at)}.
          </p>
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <RoutingPanel view={view} token={token} canEdit={canEdit} onChanged={reload} onError={handle} />

      <div className="section-grid">
        <SectionForm title="Routing" description="The default dealer and the distance bands." fields={routingFields} values={view.settings} canEdit={canEdit} onSave={save} />
        <SectionForm title="Emails and ADF" description="Who our emails come from, and which templates they use." fields={emailFields} values={view.settings} canEdit={canEdit} onSave={save} />
      </div>

      <Activity events={view.events} />
    </div>
  )
}

// ---------------------------------------------------------------- routing switch

const SWITCH: Record<Mode, Array<{ to: Mode; label: string; kind: string; explain: string }>> = {
  off: [
    { to: 'live', label: 'Turn routing on', kind: 'btn-primary', explain: 'Each lead goes to the closest active dealer it qualifies for.' },
    { to: 'shadow', label: 'Shadow mode', kind: 'btn-secondary', explain: 'Leads still go to the default dealer; routing records who it would have chosen.' },
  ],
  shadow: [
    { to: 'live', label: 'Turn routing on', kind: 'btn-primary', explain: 'Each lead goes to the closest active dealer it qualifies for.' },
    { to: 'off', label: 'Turn routing off', kind: 'btn-secondary', explain: 'Every lead goes to the default dealer and nothing is recorded about routing.' },
  ],
  live: [
    { to: 'off', label: 'Turn routing off', kind: 'btn-danger', explain: 'Every lead goes to the default dealer from the next lead on.' },
    { to: 'shadow', label: 'Shadow mode', kind: 'btn-secondary', explain: 'Leads go to the default dealer; routing keeps recording who it would have chosen.' },
  ],
}

function RoutingPanel({ view, token, canEdit, onChanged, onError }: { view: SettingsView; token: string; canEdit: boolean; onChanged: () => void; onError: (e: unknown) => void }) {
  const [pending, setPending] = useState<Mode | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mode = view.settings.routing_mode
  const choice = SWITCH[mode].find((n) => n.to === pending)
  const def = view.default_dealer

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!pending) return
    setBusy(true)
    setError('')
    try {
      await apiSend('POST', '/settings/routing-mode', token, { mode: pending, reason })
      setPending(null)
      setReason('')
      onChanged()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setError(e instanceof Error ? e.message : 'Could not change routing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`panel status-panel status-${MODE_TONE[mode]}`}>
      <div className="status-row">
        <div>
          <span className={`badge status-${MODE_TONE[mode]}`}>Routing: {MODE_LABEL[mode]}</span>
          <p className="status-text">
            {mode === 'live'
              ? `Routing decides which dealer gets each lead. ${view.active_dealers} active ${view.active_dealers === 1 ? 'dealer' : 'dealers'}.`
              : mode === 'shadow'
                ? `Every lead goes to ${def?.name ?? 'the default dealer'}; routing records who it would have chosen.`
                : `Every lead goes to ${def?.name ?? 'the default dealer'}, as before routing.`}
          </p>
        </div>
        {canEdit && !pending ? (
          <div className="section-actions">
            {SWITCH[mode].map((n) => (
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
            <strong>{choice.label}?</strong> {choice.explain} Takes effect on the next lead.
          </p>
          <label>
            <span>Reason (saved in the activity log)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. local test with Juan" />
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

// ----------------------------------------------------------------- activity

const describe = (e: DealerEvent): string => {
  const detail = (typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail) as Record<string, unknown> | null
  if (!detail) return ''
  if (e.event === 'routing_mode_changed') return `${detail.from} → ${detail.to}`
  if (detail.changes && typeof detail.changes === 'object') {
    return Object.entries(detail.changes as Record<string, { from: unknown; to: unknown }>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.from ?? '—'} → ${v.to ?? '—'}`)
      .join(', ')
  }
  return ''
}

const EVENT_LABEL: Record<string, string> = { routing_mode_changed: 'Routing switched', settings_changed: 'Settings changed' }

function Activity({ events }: { events: DealerEvent[] }) {
  return (
    <section className="panel section-card">
      <div className="section-head">
        <div>
          <h2>Recent changes</h2>
          <p className="muted">The last 20 changes to these settings, who made them, and why.</p>
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
