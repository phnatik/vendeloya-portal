import { useEffect, useRef, useState } from 'react'
import { apiGet, apiSend } from '../api'

// The Assign popup on the Leads page: give an unassigned lead to a dealer by hand. Saving
// records the assignment and sends the ADF straight away (to the live CRM if the dealer is
// active, its test inbox if testing). Territory, caps and filters don't apply. The person
// choosing decides.

type DealerOption = { id: number; slug: string; name: string; status: string; city_state: string | null }

type AssignResult = {
  action: 'assign' | 'resend'
  outcome: string
  dealer: { slug: string; name: string } | null
  adf: {
    status: 'sent' | 'partial' | 'already_sent' | 'failed'
    error: string | null
    recipients: Array<{ to: string; kind: string; status: string }>
  }
}

export type AssignedLead = { leadId: number; dealerSlug: string; dealerName: string }

type Props = {
  token: string
  lead: { id: number; name: string; vehicle: string; zip: string }
  onClose: () => void
  // Called once the assignment is saved, even if the ADF send then failed.
  onAssigned: (assigned: AssignedLead) => void
}

export default function AssignLeadDialog({ token, lead, onClose, onAssigned }: Props) {
  const [dealers, setDealers] = useState<DealerOption[] | null>(null)
  const [dealerId, setDealerId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<AssignResult | null>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    let live = true
    apiGet<DealerOption[]>('/dealers', token)
      .then((all) => {
        if (live) setDealers(all.filter((d) => d.status === 'active' || d.status === 'testing'))
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [token])

  useEffect(() => {
    if (dealers) selectRef.current?.focus()
  }, [dealers])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const chosen = dealers?.find((d) => String(d.id) === dealerId) ?? null

  const assign = async () => {
    if (!chosen) return
    setSaving(true)
    setError('')
    try {
      const r = await apiSend<AssignResult>('POST', `/user/${lead.id}/assign`, token, { dealer_id: chosen.id })
      setResult(r)
      if (r.dealer) onAssigned({ leadId: lead.id, dealerSlug: r.dealer.slug, dealerName: r.dealer.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign the lead.')
    } finally {
      setSaving(false)
    }
  }

  const sentOk = result && (result.adf.status === 'sent' || result.adf.status === 'already_sent')

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="assign-title">
        <h2 id="assign-title" className="dialog-title">Assign lead</h2>
        <p className="dialog-lead">
          <strong>{lead.name || 'Unnamed seller'}</strong>
          {lead.vehicle ? ` · ${lead.vehicle}` : ''}
          {lead.zip ? ` · ZIP ${lead.zip}` : ''}
        </p>

        {result ? (
          <>
            <p className={sentOk ? 'dialog-ok' : 'error'}>
              {sentOk
                ? `Assigned to ${result.dealer?.name}. The lead was sent to their ${chosen?.status === 'testing' ? 'test inbox' : 'CRM'}.`
                : result.adf.status === 'partial'
                  ? `Assigned to ${result.dealer?.name}, but only some addresses got the lead.`
                  : `Assigned to ${result.dealer?.name}, but the lead could not be sent: ${result.adf.error}`}
            </p>
            {result.adf.recipients.length ? (
              <ul className="dialog-recipients">
                {result.adf.recipients.map((r) => (
                  <li key={r.to}>
                    {r.to} <span className="muted">({r.kind}, {r.status})</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="dialog-actions">
              {!sentOk ? (
                <button type="button" className="btn btn-secondary" onClick={assign} disabled={saving}>
                  {saving ? 'Sending…' : 'Try sending again'}
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={onClose} disabled={saving}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="dialog-field">
              <span>Which dealer should get this lead?</span>
              <select
                ref={selectRef}
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                disabled={!dealers || saving}
              >
                <option value="">{dealers ? 'Choose a dealer' : 'Loading dealers…'}</option>
                {dealers?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.city_state ? ` (${d.city_state})` : ''}
                    {d.status === 'testing' ? ' (testing)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {chosen ? (
              <p className="muted">
                {chosen.status === 'testing'
                  ? 'This dealer is in testing: the lead goes to its test inbox only.'
                  : "The lead is sent to this dealer's CRM as soon as you assign it."}
              </p>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <div className="dialog-actions">
              <button type="button" className="btn btn-quiet" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={assign} disabled={!chosen || saving}>
                {saving ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
