import { useEffect, useState } from 'react'
import { apiGet, query, UnauthorizedError } from '../api'
import {
  reasonLabel,
  REASON_LABELS,
  type CapUsage,
  type DeliveriesReport,
  type RoutingReport,
  type UnassignedReport,
} from './types'

// The Reports tab: three views over the backend's /reports endpoints.
//   Routing      assigned vs unassigned, per dealer (leads, distance, caps, deliveries)
//   Unassigned   the leads no dealer took — the ones someone has to act on
//   Deliveries   exactly what was sent to a dealer, lead by lead
// One date range (empty = this month so far) applies to all three.

type Tab = 'routing' | 'unassigned' | 'deliveries'

type Props = {
  token: string
  onUnauthorized: (message: string) => void
}

const pct = (n: number, d: number): string => (d ? `${Math.round((n / d) * 100)}%` : '—')
const money = (n: number | null): string => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`)
const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
const capText = (c: CapUsage): string => (c ? `${c.used} / ${c.limit}` : 'No cap')

// CSV of whatever table is on screen, for the views someone works from a spreadsheet.
const downloadCsv = (name: string, header: string[], rows: Array<Array<string | number | null>>) => {
  const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Fetches `path` whenever it changes. A 401 sends the user back to sign-in. The last
// result stays on screen while the next one loads; `loading` is true until a result for
// the current path arrives.
function useReport<T>(path: string | null, token: string, onUnauthorized: Props['onUnauthorized']) {
  const [result, setResult] = useState<{ path: string | null; data: T | null; error: string }>({
    path: null,
    data: null,
    error: '',
  })

  useEffect(() => {
    if (!path) return
    let live = true
    apiGet<T>(path, token)
      .then((data) => {
        if (live) setResult({ path, data, error: '' })
      })
      .catch((e) => {
        if (!live) return
        if (e instanceof UnauthorizedError) onUnauthorized(e.message)
        else setResult((prev) => ({ path, data: prev.data, error: e instanceof Error ? e.message : 'Could not load the report.' }))
      })
    return () => {
      live = false
    }
  }, [path, token, onUnauthorized])

  return {
    data: result.data,
    error: result.path === path ? result.error : '',
    loading: path !== null && result.path !== path,
  }
}

export default function Reports({ token, onUnauthorized }: Props) {
  const [tab, setTab] = useState<Tab>('routing')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [shadow, setShadow] = useState(false)
  const [reason, setReason] = useState('')
  const [dealer, setDealer] = useState('')
  const [includeTest, setIncludeTest] = useState(false)

  // The routing report is always loaded: its dealer list also feeds the Deliveries picker.
  const routing = useReport<RoutingReport>(`/reports/routing${query({ from, to, shadow })}`, token, onUnauthorized)
  const unassigned = useReport<UnassignedReport>(
    tab === 'unassigned' ? `/reports/unassigned${query({ from, to, reason })}` : null,
    token,
    onUnauthorized,
  )
  const deliveries = useReport<DeliveriesReport>(
    tab === 'deliveries' ? `/reports/deliveries${query({ from, to, dealer, include_test: includeTest })}` : null,
    token,
    onUnauthorized,
  )

  const range = routing.data?.range
  const dealers = routing.data?.dealers ?? []

  return (
    <div className="portal-content">
      <section className="filters-grid">
        <div className="filters-header">
          <h2>Reports</h2>
          <div className="filters-actions">
            <button
              type="button"
              className="clear-filters"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              This month
            </button>
          </div>
        </div>

        <div className="report-tabs" role="tablist">
          {(['routing', 'unassigned', 'deliveries'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'report-tab active' : 'report-tab'}
              onClick={() => setTab(t)}
            >
              {t === 'routing' ? 'Routing' : t === 'unassigned' ? 'Unassigned' : 'Deliveries'}
            </button>
          ))}
        </div>

        <div className="filters-fields">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>

          {tab === 'routing' ? (
            <label className="check-label">
              <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
              Shadow mode (what routing would have done)
            </label>
          ) : null}

          {tab === 'unassigned' ? (
            <label>
              Reason
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">All reasons</option>
                {Object.entries(REASON_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tab === 'deliveries' ? (
            <>
              <label>
                Dealer
                <select value={dealer} onChange={(e) => setDealer(e.target.value)}>
                  <option value="">All dealers</option>
                  {dealers.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-label">
                <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
                Include test-inbox sends
              </label>
            </>
          ) : null}
        </div>
        {range ? (
          <p className="report-range">
            Showing {range.from} → {range.to}
          </p>
        ) : null}
      </section>

      <section className="table-section">
        {tab === 'routing' ? <RoutingView report={routing.data} error={routing.error} loading={routing.loading} /> : null}

        {tab === 'unassigned' ? (
          <>
            {unassigned.error ? <p className="error">{unassigned.error}</p> : null}
            <div className="table-meta">
              <p>
                {unassigned.loading
                  ? 'Loading…'
                  : `${(unassigned.data?.leads.length ?? 0).toLocaleString()} unassigned lead(s) — no dealer was sent these.`}
              </p>
              <div className="meta-actions">
                <button
                  type="button"
                  className="download-csv"
                  disabled={!unassigned.data?.leads.length}
                  onClick={() =>
                    downloadCsv(
                      'unassigned-leads.csv',
                      ['Lead', 'Date', 'Reason', 'Customer', 'Email', 'Phone', 'ZIP', 'Vehicle', 'Estimate', 'Nearest dealer', 'Miles', 'Its radius'],
                      (unassigned.data?.leads ?? []).map((l) => [
                        l.lead_id, l.created_at, reasonLabel(l.reason), l.customer, l.email, l.phone, l.zip, l.vehicle, l.estimate,
                        l.nearest_dealer?.slug ?? null, l.nearest_dealer?.distance_miles ?? null, l.nearest_dealer?.radius_miles ?? null,
                      ]),
                    )
                  }
                >
                  Download CSV
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Lead</th>
                    <th>Why unassigned</th>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>ZIP</th>
                    <th>Estimate</th>
                    <th>Nearest dealer</th>
                  </tr>
                </thead>
                <tbody>
                  {(unassigned.data?.leads ?? []).map((l) => (
                    <tr key={l.lead_id}>
                      <td>{when(l.created_at)}</td>
                      <td>#{l.lead_id}</td>
                      <td>
                        <span className={`badge reason-${l.reason}`}>{reasonLabel(l.reason)}</span>
                      </td>
                      <td>
                        <div>{l.customer || '—'}</div>
                        <div className="muted">{l.phone || l.email || '—'}</div>
                      </td>
                      <td>{l.vehicle || '—'}</td>
                      <td>{l.zip || '—'}</td>
                      <td>{money(l.estimate)}</td>
                      <td>
                        {l.nearest_dealer ? (
                          <>
                            <div>
                              {l.nearest_dealer.slug} · {l.nearest_dealer.distance_miles} mi
                            </div>
                            <div className="muted">
                              radius {l.nearest_dealer.radius_miles} mi{l.nearest_dealer.why_not ? ` · ${l.nearest_dealer.why_not}` : ''}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                  {!unassigned.loading && !unassigned.data?.leads.length ? (
                    <tr>
                      <td colSpan={8} className="empty-row">
                        No unassigned leads in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {tab === 'deliveries' ? (
          <>
            {deliveries.error ? <p className="error">{deliveries.error}</p> : null}
            <div className="table-meta">
              <p>
                {deliveries.loading
                  ? 'Loading…'
                  : `${(deliveries.data?.deliveries.length ?? 0).toLocaleString()} send(s)${dealer ? ` to ${dealer}` : ''}. One row per address per attempt.`}
              </p>
              <div className="meta-actions">
                <button
                  type="button"
                  className="download-csv"
                  disabled={!deliveries.data?.deliveries.length}
                  onClick={() =>
                    downloadCsv(
                      `deliveries${dealer ? `-${dealer}` : ''}.csv`,
                      ['Sent', 'Lead', 'Dealer', 'Customer', 'Vehicle', 'ZIP', 'Miles', 'Address', 'Kind', 'Status', 'Delivery', 'Error', 'Message id'],
                      (deliveries.data?.deliveries ?? []).map((d) => [
                        d.sent_at, d.lead_id, d.dealer, d.customer, d.vehicle, d.zip, d.distance_miles, d.recipient, d.recipient_kind,
                        d.status, d.delivery_status, d.error, d.message_id,
                      ]),
                    )
                  }
                >
                  Download CSV
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Lead</th>
                    <th>Dealer</th>
                    <th>Customer · vehicle</th>
                    <th>ZIP · miles</th>
                    <th>Sent to</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {(deliveries.data?.deliveries ?? []).map((d, i) => (
                    <tr key={`${d.lead_id}-${d.recipient}-${i}`}>
                      <td>{when(d.sent_at)}</td>
                      <td>#{d.lead_id}</td>
                      <td>{d.dealer}</td>
                      <td>
                        <div>{d.customer || '—'}</div>
                        <div className="muted">{d.vehicle || '—'}</div>
                      </td>
                      <td>
                        {d.zip || '—'}
                        {d.distance_miles != null ? ` · ${d.distance_miles} mi` : ''}
                      </td>
                      <td>
                        <div>{d.recipient}</div>
                        <div className="muted">{d.recipient_kind === 'crm_ingest' ? 'CRM' : d.recipient_kind}</div>
                      </td>
                      <td>
                        {d.status === 'failed' ? (
                          <span className="badge bad" title={d.error ?? ''}>
                            Failed
                          </span>
                        ) : d.delivery_status === 'delivered' ? (
                          <span className="badge good">Delivered</span>
                        ) : d.delivery_status ? (
                          <span className="badge bad">{d.delivery_status === 'hard_bounced' ? 'Hard bounce' : 'Soft bounce'}</span>
                        ) : (
                          <span className="badge">Sent</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!deliveries.loading && !deliveries.data?.deliveries.length ? (
                    <tr>
                      <td colSpan={7} className="empty-row">
                        Nothing sent in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}

function RoutingView({ report, error, loading }: { report: RoutingReport | null; error: string; loading: boolean }) {
  if (error) return <p className="error">{error}</p>
  if (!report) return <p className="empty-row">{loading ? 'Loading…' : 'No data.'}</p>
  const t = report.totals

  return (
    <>
      {report.shadow ? (
        <p className="report-note">
          Shadow mode: what routing <b>would</b> have decided. These leads were really sent to the default dealer.
        </p>
      ) : null}

      <div className="kpi-grid">
        <article className="kpi-card">
          <p className="kpi-label">Leads</p>
          <p className="kpi-value">{t.leads.toLocaleString()}</p>
          <p className="kpi-delta">Completed funnel, in range</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Assigned to a dealer</p>
          <p className="kpi-value">{t.assigned.toLocaleString()}</p>
          <p className="kpi-delta">{pct(t.assigned, t.leads)} of leads</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Unassigned</p>
          <p className="kpi-value">{t.unassigned.toLocaleString()}</p>
          <p className="kpi-delta">{pct(t.unassigned, t.leads)} of leads — see the Unassigned tab</p>
        </article>
      </div>

      {report.unassigned_by_reason.length ? (
        <div className="reason-list">
          {report.unassigned_by_reason.map((r) => (
            <span key={r.reason} className={`badge reason-${r.reason}`}>
              {reasonLabel(r.reason)}: {r.leads}
            </span>
          ))}
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dealer</th>
              <th>Status</th>
              <th>Leads</th>
              <th>Repeat customers</th>
              <th>Avg distance</th>
              <th>Radius</th>
              <th>Total cap</th>
              <th>Monthly cap</th>
              {report.shadow ? null : <th>Delivered to CRM</th>}
              {report.shadow ? null : <th>Failed / bounced</th>}
            </tr>
          </thead>
          <tbody>
            {report.dealers.map((d) => (
              <tr key={d.slug}>
                <td>
                  <div>{d.name}</div>
                  <div className="muted">{d.slug}</div>
                </td>
                <td>
                  <span className={`badge status-${d.status}`}>{d.status}</span>
                </td>
                <td>{d.leads.total}</td>
                <td>{d.leads.sticky}</td>
                <td>{d.avg_distance_miles == null ? '—' : `${d.avg_distance_miles} mi`}</td>
                <td>{d.radius_miles == null ? '—' : `${d.radius_miles} mi`}</td>
                <td className={d.caps.total && d.caps.total.remaining === 0 ? 'at-cap' : ''}>{capText(d.caps.total)}</td>
                <td className={d.caps.monthly && d.caps.monthly.remaining === 0 ? 'at-cap' : ''}>{capText(d.caps.monthly)}</td>
                {d.delivery ? <td>{d.delivery.leads_delivered}</td> : null}
                {d.delivery ? (
                  <td className={d.delivery.sends_failed + d.delivery.sends_bounced ? 'at-cap' : ''}>
                    {d.delivery.sends_failed} / {d.delivery.sends_bounced}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="report-note">
        Caps show usage right now (total = all time, monthly = this month), whatever range is selected. “Delivered to CRM” counts leads
        MailerSend accepted for the dealer’s CRM address; test inboxes are never counted.
      </p>
    </>
  )
}
