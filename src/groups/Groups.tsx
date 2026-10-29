import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiGet, apiSend, UnauthorizedError } from '../api'
import SectionForm from '../dealers/SectionForm'
import type { GroupRow } from '../reports/types'
import type { DealerListRow } from '../dealers/types'

// Dealer groups (e.g. Covert Auto Group): the parent a set of stores belongs to. Groups
// are for organizing and reporting only — each store keeps its own territory, caps, filters
// and CRM, and routing never looks at the group.

type Props = {
  token: string
  canEdit: boolean
  onUnauthorized: (message: string) => void
  onOpenDealer: (slug: string) => void
  onOpenReports: (scope: string) => void
}

const STATUS_LABEL = { inactive: 'Inactive', testing: 'Testing', active: 'Active' } as const

export default function Groups({ token, canEdit, onUnauthorized, onOpenDealer, onOpenReports }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRow[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [version, setVersion] = useState(0)

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorizedError) onUnauthorized(e.message)
      else setError(e instanceof Error ? e.message : 'Something went wrong.')
    },
    [onUnauthorized],
  )

  useEffect(() => {
    let live = true
    apiGet<GroupRow[]>('/groups', token)
      .then((rows) => live && setGroups(rows))
      .catch((e) => live && handle(e))
    return () => {
      live = false
    }
  }, [token, version, selected, handle])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const g = await apiSend<GroupRow>('POST', '/groups', token, { name })
      setName('')
      setCreating(false)
      setSelected(g.slug)
    } catch (e) {
      handle(e)
    }
  }

  const group = selected ? groups?.find((g) => g.slug === selected) : null
  if (selected && group) {
    return (
      <GroupPage
        group={group}
        token={token}
        canEdit={canEdit}
        onBack={() => setSelected(null)}
        onChanged={() => setVersion((v) => v + 1)}
        onError={handle}
        onOpenDealer={onOpenDealer}
        onOpenReports={onOpenReports}
      />
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Dealer groups</h1>
          <p className="page-desc">Stores that belong to the same dealer group, for reporting by store or by group.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCreating((v) => !v)}>
              New group
            </button>
          </div>
        ) : null}
      </header>

      {creating ? (
        <form className="panel inline-form new-form" onSubmit={create}>
          <label>
            <span>Group name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Covert Auto Group" />
          </label>
          <button type="submit" className="btn btn-primary">
            Create group
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
                <th>Group</th>
                <th className="num">Stores</th>
                <th className="num">Active</th>
                <th className="num">Leads this month</th>
                <th className="num">All time</th>
              </tr>
            </thead>
            <tbody>
              {(groups ?? []).map((g) => (
                <tr key={g.slug} className="clickable" onClick={() => setSelected(g.slug)}>
                  <td>
                    <button type="button" className="link-button" onClick={() => setSelected(g.slug)}>
                      {g.name}
                    </button>
                    <div className="muted">{g.stores.map((s) => s.name).join(', ') || 'No stores yet'}</div>
                  </td>
                  <td className="num">{g.store_count}</td>
                  <td className="num">{g.active_count}</td>
                  <td className="num">{g.leads_this_month}</td>
                  <td className="num">{g.leads_total}</td>
                </tr>
              ))}
              {groups && !groups.length ? (
                <tr>
                  <td colSpan={5} className="empty-row">
                    No dealer groups yet. Create one with New group, then add its stores.
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

function GroupPage({
  group,
  token,
  canEdit,
  onBack,
  onChanged,
  onError,
  onOpenDealer,
  onOpenReports,
}: {
  group: GroupRow
  token: string
  canEdit: boolean
  onBack: () => void
  onChanged: () => void
  onError: (e: unknown) => void
  onOpenDealer: (slug: string) => void
  onOpenReports: (scope: string) => void
}) {
  const [dealers, setDealers] = useState<DealerListRow[]>([])
  const [adding, setAdding] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let live = true
    apiGet<DealerListRow[]>('/dealers', token)
      .then((rows) => live && setDealers(rows))
      .catch((e) => live && onError(e))
    return () => {
      live = false
    }
  }, [token, group, onError])

  // Membership lives on the store, so adding or removing one is a change to that dealer
  // (logged on its page like any other).
  const setGroupOf = async (slug: string, groupId: number | null, reason: string) => {
    setMessage('')
    try {
      await apiSend('PATCH', `/dealers/${slug}/profile`, token, { group_id: groupId ?? '', reason })
      setAdding('')
      onChanged()
    } catch (e) {
      if (e instanceof UnauthorizedError) onError(e)
      else setMessage(e instanceof Error ? e.message : 'Could not save.')
    }
  }

  const outside = dealers.filter((d) => !group.stores.some((s) => s.slug === d.slug))

  return (
    <div className="page">
      <button type="button" className="btn btn-quiet back-link" onClick={onBack}>
        All groups
      </button>
      <header className="page-head">
        <div>
          <h1 className="page-title">{group.name}</h1>
          <p className="page-desc">
            {group.store_count} {group.store_count === 1 ? 'store' : 'stores'}, {group.active_count} active. {group.leads_this_month} leads this month,{' '}
            {group.leads_total} all time.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => onOpenReports(`group:${group.slug}`)}>
            View group reports
          </button>
        </div>
      </header>

      <section className="panel section-card">
        <div className="section-head">
          <div>
            <h2>Stores</h2>
            <p className="muted">Each store keeps its own territory, caps, filters and CRM. Open a store to change those.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Store</th>
                <th>Status</th>
                <th className="num">Leads this month</th>
                <th className="num">All time</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {group.stores.map((s) => (
                <tr key={s.slug}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpenDealer(s.slug)}>
                      {s.name}
                    </button>
                    <div className="muted">{s.city_state || ''}</div>
                  </td>
                  <td>
                    <span className={`badge status-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="num">{s.leads_this_month}</td>
                  <td className="num">{s.leads_total}</td>
                  {canEdit ? (
                    <td className="num">
                      <button type="button" className="btn btn-quiet" onClick={() => setGroupOf(s.slug, null, `removed from ${group.name}`)}>
                        Remove from group
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
              {!group.stores.length ? (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="empty-row">
                    No stores in this group yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {canEdit && outside.length ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (adding) void setGroupOf(adding, group.id, `added to ${group.name}`)
            }}
          >
            <label>
              <span>Add a store to this group</span>
              <select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose a store…</option>
                {outside.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                    {d.group ? ` (now in ${d.group.name})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-secondary" disabled={!adding}>
              Add store
            </button>
          </form>
        ) : null}
        {message ? <p className="error form-error">{message}</p> : null}
      </section>

      <SectionForm
        title="Group details"
        fields={[
          { key: 'name', label: 'Group name', type: 'text' },
          { key: 'notes', label: 'Notes', type: 'text' },
        ]}
        values={group}
        canEdit={canEdit}
        askReason={false}
        onSave={async (changes) => {
          try {
            await apiSend('PATCH', `/groups/${group.slug}`, token, changes)
            onChanged()
          } catch (e) {
            if (e instanceof UnauthorizedError) onError(e)
            throw e
          }
        }}
      />
    </div>
  )
}
