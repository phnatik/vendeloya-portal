// Shapes returned by GET /api/v1/reports/* (backend modules/reports/reportService.js).

export type Range = { from: string; to: string }

export type CapUsage = { limit: number; used: number; remaining: number } | null

export type DealerRow = {
  slug: string
  name: string
  status: 'inactive' | 'testing' | 'active'
  zip_count: number
  weight: number
  leads: { assigned: number; sticky: number; manual: number; total: number }
  avg_distance_miles: number | null
  caps: { total: CapUsage; monthly: CapUsage }
  delivery: { leads_delivered: number; sends_failed: number; sends_bounced: number } | null
}

// One dealer's territory (when a dealer is selected): leads from its ZIPs split by who got
// them, and why it missed the ones it didn't get.
export type DealerArea = {
  total: number
  received: number
  other_dealer: number
  unassigned: number
  missed: { total_cap: number; monthly_cap: number; filtered_out: number; outranked: number }
}

export type RoutingReport = {
  range: Range
  shadow: boolean
  dealer: string | null
  area: DealerArea | null
  totals: { leads: number; assigned: number; unassigned: number }
  unassigned_by_reason: Array<{ reason: string; leads: number }>
  dealers: DealerRow[]
}

export type UnassignedLead = {
  lead_id: number
  created_at: string
  reason: string
  customer: string | null
  email: string | null
  phone: string | null
  zip: string | null
  vehicle: string | null
  mileage: string | null
  estimate: number | null
  // the closest owner of the lead's ZIP and why it didn't take it (null: nobody owns the ZIP)
  nearest_dealer: { slug: string; distance_miles: number | null; why_not: string | null } | null
}

export type UnassignedReport = { range: Range; dealer: string | null; leads: UnassignedLead[] }

export type Delivery = {
  sent_at: string
  lead_id: number
  dealer: string
  customer: string | null
  vehicle: string | null
  zip: string | null
  distance_miles: number | null
  recipient: string
  recipient_kind: 'crm_ingest' | 'backup' | 'test'
  status: 'sent' | 'failed'
  delivery_status: 'delivered' | 'soft_bounced' | 'hard_bounced' | null
  error: string | null
  message_id: string | null
}

export type DeliveriesReport = { range: Range; dealer: string | null; deliveries: Delivery[] }

// Plain-English labels for the router's unassigned reasons.
// out_of_range and unknown_zip only appear on leads routed by radius, before 2026-10-28.
export const REASON_LABELS: Record<string, string> = {
  not_in_territory: 'ZIP isn’t in any dealer’s territory',
  all_capped: 'The ZIP’s dealer is at its cap',
  filtered_out: 'Dealer filters declined it (e.g. vehicle year)',
  no_active_dealers: 'No active dealers',
  out_of_range: 'Outside every dealer’s radius (old)',
  unknown_zip: 'ZIP code not recognised (old)',
}

export const reasonLabel = (reason: string): string => REASON_LABELS[reason] || reason

// Why a dealer missed a lead from one of its own ZIPs.
export const MISSED_LABELS: Record<keyof DealerArea['missed'], string> = {
  outranked: 'A co-owner of the ZIP got it in the rotation',
  filtered_out: 'Its filters declined it',
  total_cap: 'It was at its total cap',
  monthly_cap: 'It was at its monthly cap',
}

export type VehicleDealerRow = {
  slug: string | null // null = unassigned
  name: string
  leads: number
  avg_mileage: number | null
  avg_model_year: number | null
  avg_age_years: number | null
  top_make: { make: string; leads: number; share: number } | null
  counted: { mileage: number; model_year: number }
}

export type VehicleReport = {
  range: Range
  dealer: string | null
  group_total: VehicleDealerRow | null
  dealers: VehicleDealerRow[]
  makes: { total: number; rows: Array<{ make: string; leads: number; share: number; other?: boolean }> }
}

// GET /api/v1/groups
export type GroupRow = {
  id: number
  slug: string
  name: string
  notes: string | null
  store_count: number
  active_count: number
  leads_this_month: number
  leads_total: number
  stores: Array<{ slug: string; name: string; status: 'inactive' | 'testing' | 'active'; city_state: string | null; leads_this_month: number; leads_total: number }>
}
