import { useEffect, useState } from 'react'
import { apiGet, query, UnauthorizedError } from '../api'
import BarChart from './BarChart'
import {
  MISSED_LABELS,
  reasonLabel,
  REASON_LABELS,
  type DealerArea,
  type GroupRow,
  type CapUsage,
  type DeliveriesReport,
  type RoutingReport,
  type UnassignedReport,
  type VehicleReport,
} from './types'

// The Reports tab: three views over the backend's /reports endpoints.
//   Routing      assigned vs unassigned, per dealer (leads, distance, caps, deliveries)
//   Unassigned   the leads no dealer took — the ones someone has to act on
//   Deliveries   exactly what was sent to a dealer, lead by lead
// One date range (empty = this month so far) and one dealer picker apply to every view.
// The picker holds a store ("<slug>") or a whole dealer group ("group:<slug>").
// With a dealer picked, Routing shows that dealer's area, Unassigned shows the leads in
// its ZIPs nobody took, and Deliveries shows what it was sent.

type Tab = 'routing' | 'unassigned' | 'deliveries' | 'vehicles'

const TAB_LABELS: Record<Tab, string> = {
  routing: 'Routing',
  unassigned: 'Unassigned',
  deliveries: 'Deliveries',
  vehicles: 'Vehicles',
}

type Props = {
  token: string
  onUnauthorized: (message: string) => void
  // Open with a store or group already picked, e.g. from a group's page.
  initialScope?: string
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

export default function Reports({ token, onUnauthorized, initialScope = '' }: Props) {
  const [tab, setTab] = useState<Tab>('routing')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [shadow, setShadow] = useState(false)
  const [reason, setReason] = useState('')
  const [dealer, setDealer] = useState(initialScope)
  const [includeTest, setIncludeTest] = useState(false)

  // Every dealer and group, for the picker, whatever is selected.
  const dealerList = useReport<RoutingReport>('/reports/routing', token, onUnauthorized)
  const groupList = useReport<GroupRow[]>('/groups', token, onUnauthorized)
  const isGroup = dealer.startsWith('group:')
  const scopeQuery = isGroup ? { group: dealer.slice(6) } : { dealer }
  const routing = useReport<RoutingReport>(`/reports/routing${query({ from, to, shadow, ...scopeQuery })}`, token, onUnauthorized)
  const unassigned = useReport<UnassignedReport>(
    tab === 'unassigned' ? `/reports/unassigned${query({ from, to, reason, ...scopeQuery })}` : null,
    token,
    onUnauthorized,
  )
  const deliveries = useReport<DeliveriesReport>(
    tab === 'deliveries' ? `/reports/deliveries${query({ from, to, ...scopeQuery, include_test: includeTest })}` : null,
    token,
    onUnauthorized,
  )

  const vehicles = useReport<VehicleReport>(
    tab === 'vehicles' ? `/reports/vehicles${query({ from, to, ...scopeQuery })}` : null,
    token,
    onUnauthorized,
  )

  const range = routing.data?.range
  const dealers = dealerList.data?.dealers ?? []
  const groups = groupList.data ?? []
  const dealerName = isGroup
    ? (groups.find((g) => `group:${g.slug}` === dealer)?.name ?? dealer.slice(6))
    : (dealers.find((d) => d.slug === dealer)?.name ?? dealer)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-desc">Where leads went, which ones no dealer took, and what each dealer was sent.</p>
        </div>
      </header>

      <section className="panel toolbar">
        <div className="segmented" role="tablist" aria-label="Report">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'segment active' : 'segment'}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="toolbar-fields">
          <label>
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            This month
          </button>
          <label>
            Dealer
            <select value={dealer} onChange={(e) => setDealer(e.target.value)}>
              <option value="">All dealers</option>
              {groups.length ? (
                <optgroup label="Dealer groups">
                  {groups.map((g) => (
                    <option key={g.slug} value={`group:${g.slug}`}>
                      {g.name} (all stores)
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Stores">
                {dealers.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          {tab === 'routing' ? (
            <label className="check-label">
              <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
              Show shadow mode (what routing would have done)
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
            <label className="check-label">
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
              Include test-inbox sends
            </label>
          ) : null}
        </div>
        {range ? (
          <p className="report-range">
            {range.from} to {range.to}
          </p>
        ) : null}
      </section>

      <section className="table-section">
        {tab === 'routing' ? (
          <RoutingView report={routing.data} error={routing.error} loading={routing.loading} dealerName={dealerName} isGroup={isGroup} />
        ) : null}

        {tab === 'vehicles' ? (
          <VehiclesView report={vehicles.data} error={vehicles.error} loading={vehicles.loading} dealerName={dealerName} />
        ) : null}

        {tab === 'unassigned' ? (
          <>
            {unassigned.error ? <p className="error">{unassigned.error}</p> : null}
            <div className="table-meta">
              <p>
                {unassigned.loading
                  ? 'Loading…'
                  : dealer
                    ? `${(unassigned.data?.leads.length ?? 0).toLocaleString()} lead(s) from ${isGroup ? `any ${dealerName} store’s ZIPs` : `${dealerName}’s ZIPs`} that no dealer was sent.`
                    : `${(unassigned.data?.leads.length ?? 0).toLocaleString()} unassigned lead(s). No dealer was sent these.`}
              </p>
              <div className="meta-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!unassigned.data?.leads.length}
                  onClick={() =>
                    downloadCsv(
                      'unassigned-leads.csv',
                      ['Lead', 'Date', 'Reason', 'Customer', 'Email', 'Phone', 'ZIP', 'Vehicle', 'Estimate', 'ZIP owner', 'Miles', 'Why not'],
                      (unassigned.data?.leads ?? []).map((l) => [
                        l.lead_id, l.created_at, reasonLabel(l.reason), l.customer, l.email, l.phone, l.zip, l.vehicle, l.estimate,
                        l.nearest_dealer?.slug ?? null, l.nearest_dealer?.distance_miles ?? null, l.nearest_dealer?.why_not ?? null,
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
                    <th>ZIP owner</th>
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
                              {l.nearest_dealer.slug}
                              {l.nearest_dealer.distance_miles == null ? '' : `, ${l.nearest_dealer.distance_miles} mi away`}
                            </div>
                            <div className="muted">
                              {l.nearest_dealer.why_not
                                ? `${l.nearest_dealer.why_not[0].toUpperCase()}${l.nearest_dealer.why_not.slice(1)}`
                                : '—'}
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
                  : `${(deliveries.data?.deliveries.length ?? 0).toLocaleString()} send(s)${dealer ? ` to ${dealerName}` : ''}. One row per address per attempt.`}
              </p>
              <div className="meta-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!deliveries.data?.deliveries.length}
                  onClick={() =>
                    downloadCsv(
                      `deliveries${dealer ? `-${dealer.replace('group:', '')}` : ''}.csv`,
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
                    <th>Customer</th>
                    <th>ZIP</th>
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
                        <div>{d.zip || '—'}</div>
                        {d.distance_miles != null ? <div className="muted">{d.distance_miles} mi</div> : null}
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

function RoutingView({
  report,
  error,
  loading,
  dealerName,
  isGroup,
}: {
  report: RoutingReport | null
  error: string
  loading: boolean
  dealerName: string
  isGroup: boolean
}) {
  if (error) return <p className="error">{error}</p>
  if (!report) return <p className="empty-row">{loading ? 'Loading…' : 'No data.'}</p>

  return (
    <>
      {report.shadow ? (
        <p className="report-note">
          Shadow mode: what routing <b>would</b> have decided. These leads were really sent to the default dealer.
        </p>
      ) : null}

      {report.area ? <AreaFlow area={report.area} name={dealerName} isGroup={isGroup} /> : <LeadFlow report={report} />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dealer</th>
              <th>Status</th>
              <th className="num">Leads</th>
              <th className="num">Repeat customers</th>
              <th>Avg distance</th>
              <th>ZIPs</th>
              <th>Total cap</th>
              <th>Monthly cap</th>
              {report.shadow ? null : <th className="num">Delivered to CRM</th>}
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
                <td className="num">{d.leads.total}</td>
                <td className="num">{d.leads.sticky}</td>
                <td>{d.avg_distance_miles == null ? '—' : `${d.avg_distance_miles} mi`}</td>
                <td className={d.zip_count ? '' : 'at-cap'}>{d.zip_count || 'None'}</td>
                <td className={d.caps.total && d.caps.total.remaining === 0 ? 'at-cap' : ''}>{capText(d.caps.total)}</td>
                <td className={d.caps.monthly && d.caps.monthly.remaining === 0 ? 'at-cap' : ''}>{capText(d.caps.monthly)}</td>
                {d.delivery ? <td className="num">{d.delivery.leads_delivered}</td> : null}
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

// Where this period's leads went: one bar, split by dealer, with what no dealer took
// shown hatched at the end. The first thing on the page because it answers the question
// people open Reports to ask.
const FLOW_SHADES = ['#0C4A36', '#0D7A52', '#4FA37E', '#8CC7AA', '#BFE0CF']

function LeadFlow({ report }: { report: RoutingReport }) {
  const t = report.totals
  const parts = report.dealers
    .filter((d) => d.leads.total > 0)
    .sort((a, b) => b.leads.total - a.leads.total)
    .map((d, i) => ({ key: d.slug, label: d.name, count: d.leads.total, color: FLOW_SHADES[i % FLOW_SHADES.length] }))
  const share = (n: number) => (t.leads ? (n / t.leads) * 100 : 0)

  return (
    <div className="flow">
      <p className="flow-total">
        <span className="flow-number">{t.leads.toLocaleString()}</span>
        <span className="flow-caption">
          {t.leads === 1 ? 'lead' : 'leads'} in this range
          {t.leads ? `, ${pct(t.assigned, t.leads)} went to a dealer` : ''}
        </span>
      </p>

      {t.leads ? (
        <div className="flow-bar" role="img" aria-label={`${t.assigned} assigned, ${t.unassigned} unassigned`}>
          {parts.map((p) => (
            <span key={p.key} style={{ width: `${share(p.count)}%`, background: p.color }} title={`${p.label}: ${p.count}`} />
          ))}
          {t.unassigned ? (
            <span className="flow-unassigned" style={{ width: `${share(t.unassigned)}%` }} title={`Unassigned: ${t.unassigned}`} />
          ) : null}
        </div>
      ) : (
        <p className="empty-row">No leads in this range yet.</p>
      )}

      {t.leads ? (
        <ul className="flow-legend">
          {parts.map((p) => (
            <li key={p.key}>
              <i style={{ background: p.color }} aria-hidden="true" />
              <span className="flow-name">{p.label}</span>
              <span className="flow-count">
                {p.count.toLocaleString()} ({pct(p.count, t.leads)})
              </span>
            </li>
          ))}
          {t.unassigned ? (
            <li>
              <i className="flow-unassigned" aria-hidden="true" />
              <span className="flow-name">Unassigned</span>
              <span className="flow-count">
                {t.unassigned.toLocaleString()} ({pct(t.unassigned, t.leads)})
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {report.unassigned_by_reason.length ? (
        <div className="reason-list">
          <span className="muted">Why unassigned:</span>
          {report.unassigned_by_reason.map((r) => (
            <span key={r.reason} className={`badge reason-${r.reason}`}>
              {reasonLabel(r.reason)} ({r.leads})
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// The same bar for one dealer: the leads from its ZIPs, split into what it got, what
// another dealer got, and what nobody got, with why it missed the rest.
function AreaFlow({ area, name, isGroup }: { area: DealerArea; name: string; isGroup: boolean }) {
  const share = (n: number) => (area.total ? (n / area.total) * 100 : 0)
  const missed = (Object.keys(MISSED_LABELS) as Array<keyof DealerArea['missed']>).filter((k) => area.missed[k] > 0)
  const parts = [
    { key: 'received', label: name, count: area.received, color: '#0C4A36' },
    { key: 'other', label: 'Another dealer', count: area.other_dealer, color: '#8CC7AA' },
  ]

  return (
    <div className="flow">
      <p className="flow-total">
        <span className="flow-number">{area.received.toLocaleString()}</span>
        <span className="flow-caption">
          {area.received === 1 ? 'lead' : 'leads'} went to {name}
          {area.total ? `, ${pct(area.received, area.total)} of the ${area.total.toLocaleString()} in its area` : ''}
        </span>
      </p>

      {area.total ? (
        <div className="flow-bar" role="img" aria-label={`${area.received} to ${name}, ${area.other_dealer} to another dealer, ${area.unassigned} unassigned`}>
          {parts.filter((p) => p.count > 0).map((p) => (
            <span key={p.key} style={{ width: `${share(p.count)}%`, background: p.color }} title={`${p.label}: ${p.count}`} />
          ))}
          {area.unassigned ? (
            <span className="flow-unassigned" style={{ width: `${share(area.unassigned)}%` }} title={`Unassigned: ${area.unassigned}`} />
          ) : null}
        </div>
      ) : (
        <p className="empty-row">No leads in this dealer’s area in this range.</p>
      )}

      {area.total ? (
        <ul className="flow-legend">
          {parts.map((p) => (
            <li key={p.key}>
              <i style={{ background: p.color }} aria-hidden="true" />
              <span className="flow-name">{p.label}</span>
              <span className="flow-count">
                {p.count.toLocaleString()} ({pct(p.count, area.total)})
              </span>
            </li>
          ))}
          <li>
            <i className="flow-unassigned" aria-hidden="true" />
            <span className="flow-name">Unassigned</span>
            <span className="flow-count">
              {area.unassigned.toLocaleString()} ({pct(area.unassigned, area.total)})
            </span>
          </li>
        </ul>
      ) : null}

      {missed.length ? (
        <div className="reason-list">
          <span className="muted">Why {name} missed {area.other_dealer + area.unassigned}:</span>
          {missed.map((k) => (
            <span key={k} className={`badge ${k === 'outranked' ? '' : k === 'filtered_out' ? 'reason-filtered_out' : 'reason-all_capped'}`}>
              {MISSED_LABELS[k]} ({area.missed[k]})
            </span>
          ))}
        </div>
      ) : null}

      <p className="report-note">
        {isGroup
          ? '“Its area” is every lead from any of its stores’ ZIPs, plus any repeat customer sent to one of them from elsewhere.'
          : '“Its area” is every lead from its ZIPs, plus any repeat customer sent to it from elsewhere.'}
      </p>
    </div>
  )
}

const miles = (n: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString()} mi`)

// What kind of vehicles each dealer is getting. Two bar charts side by side (average
// mileage, average age), the per-dealer table, then the make breakdown with its table.
// Age rather than model year in the chart: a bar's length must mean an amount, and
// "2019" drawn from zero means nothing; the table carries the model year itself.
function VehiclesView({
  report,
  error,
  loading,
  dealerName,
}: {
  report: VehicleReport | null
  error: string
  loading: boolean
  dealerName: string
}) {
  if (error) return <p className="error">{error}</p>
  if (!report) return <p className="empty-row">{loading ? 'Loading…' : 'No data.'}</p>
  if (!report.dealers.length) return <p className="empty-row">No routed leads in this range.</p>

  const scope = report.dealer ? dealerName : 'all leads'
  const counted = (r: VehicleReport['dealers'][number], n: number) => `${r.leads} leads, ${n} with a usable value`

  return (
    <div className={loading ? 'refreshing' : ''}>
      <div className="chart-grid">
        <BarChart
          title="Average mileage"
          caption="By dealer, for leads in this range"
          unit="miles"
          rows={report.dealers.map((r) => ({
            key: r.slug ?? 'unassigned',
            label: r.name,
            value: r.avg_mileage,
            display: miles(r.avg_mileage),
            detail: counted(r, r.counted.mileage),
            muted: r.slug === null,
          }))}
        />
        <BarChart
          title="Average vehicle age"
          caption="Years since model year"
          unit="years"
          rows={report.dealers.map((r) => ({
            key: r.slug ?? 'unassigned',
            label: r.name,
            value: r.avg_age_years,
            display: r.avg_age_years == null ? '—' : `${r.avg_age_years} yrs`,
            detail: r.avg_model_year == null ? undefined : `Average model year ${r.avg_model_year}. ${counted(r, r.counted.model_year)}`,
            muted: r.slug === null,
          }))}
        />
      </div>

      <div className="table-wrap section-gap">
        <table>
          <thead>
            <tr>
              <th>Dealer</th>
              <th className="num">Leads</th>
              <th className="num">Avg mileage</th>
              <th className="num">Avg model year</th>
              <th className="num">Avg age</th>
              <th>Most common make</th>
            </tr>
          </thead>
          <tbody>
            {report.group_total ? (
              <tr className="total-row">
                <td>{report.group_total.name}</td>
                <td className="num">{report.group_total.leads}</td>
                <td className="num">{miles(report.group_total.avg_mileage)}</td>
                <td className="num">{report.group_total.avg_model_year ?? '—'}</td>
                <td className="num">{report.group_total.avg_age_years == null ? '—' : `${report.group_total.avg_age_years} yrs`}</td>
                <td>{report.group_total.top_make ? `${report.group_total.top_make.make} (${report.group_total.top_make.leads}, ${report.group_total.top_make.share}%)` : '—'}</td>
              </tr>
            ) : null}
            {report.dealers.map((r) => (
              <tr key={r.slug ?? 'unassigned'}>
                <td className={r.slug ? '' : 'muted'}>{r.name}</td>
                <td className="num">{r.leads}</td>
                <td className="num">{miles(r.avg_mileage)}</td>
                <td className="num">{r.avg_model_year ?? '—'}</td>
                <td className="num">{r.avg_age_years == null ? '—' : `${r.avg_age_years} yrs`}</td>
                <td>{r.top_make ? `${r.top_make.make} (${r.top_make.leads}, ${r.top_make.share}%)` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="chart-grid section-gap">
        <BarChart
          title="Top makes"
          caption={`Leads by make, ${scope}`}
          unit="leads"
          rows={report.makes.rows.map((m) => ({
            key: m.make,
            label: m.make,
            value: m.leads,
            display: `${m.leads}`,
            detail: `${m.share}% of ${report.makes.total} leads`,
            muted: !!m.other,
          }))}
        />
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Make</th>
                <th className="num">Leads</th>
                <th className="num">Share</th>
              </tr>
            </thead>
            <tbody>
              {report.makes.rows.map((m) => (
                <tr key={m.make}>
                  <td className={m.other ? 'muted' : ''}>{m.make}</td>
                  <td className="num">{m.leads}</td>
                  <td className="num">{m.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="report-note">
        Leads count toward the dealer routing sent them to; “Unassigned” is what no dealer took. Averages use only leads with a
        usable mileage or model year; hover or focus a bar to see how many that was.
      </p>
    </div>
  )
}
