// Shapes returned by GET /api/v1/reports/* (backend modules/reports/reportService.js).

export type Range = { from: string; to: string }

export type CapUsage = { limit: number; used: number; remaining: number } | null

export type DealerRow = {
  slug: string
  name: string
  status: 'inactive' | 'testing' | 'active'
  radius_miles: number | null
  weight: number
  leads: { assigned: number; sticky: number; manual: number; total: number }
  avg_distance_miles: number | null
  caps: { total: CapUsage; monthly: CapUsage }
  delivery: { leads_delivered: number; sends_failed: number; sends_bounced: number } | null
}

// One dealer's territory (when a dealer is selected): leads inside its radius split by
// who got them, and why it missed the ones it didn't get.
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
  nearest_dealer: { slug: string; distance_miles: number; radius_miles: number; why_not: string | null } | null
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
export const REASON_LABELS: Record<string, string> = {
  out_of_range: 'Outside every dealer’s radius',
  all_capped: 'Dealer in range is at its cap',
  filtered_out: 'Dealer filters declined it (e.g. vehicle year)',
  unknown_zip: 'ZIP code not recognised',
  no_active_dealers: 'No active dealers',
}

export const reasonLabel = (reason: string): string => REASON_LABELS[reason] || reason

// Why a dealer missed a lead that was inside its radius.
export const MISSED_LABELS: Record<keyof DealerArea['missed'], string> = {
  outranked: 'A closer or less-busy dealer got it',
  filtered_out: 'Its filters declined it',
  total_cap: 'It was at its total cap',
  monthly_cap: 'It was at its monthly cap',
}
