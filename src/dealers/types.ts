// Shapes returned by GET /api/v1/dealers and /api/v1/dealers/:slug.

export type DealerStatus = 'inactive' | 'testing' | 'active'

export type DealerListRow = {
  id: number
  slug: string
  name: string
  status: DealerStatus
  group: { slug: string; name: string } | null
  city_state: string | null
  zip_code: string
  crm_vendor: string | null
  go_live_at: string | null
  zip_count: number
  lat: number | null
  lng: number | null
  weight: number
  total_cap: number | null
  monthly_cap: number | null
  leads_total: number
  leads_this_month: number
  crm_recipients: number
  test_recipients: number
}

export type Recipient = { id: number; email: string; kind: 'crm_ingest' | 'backup' | 'test'; active: number }
export type Contact = { id: number; name: string | null; role: string | null; email: string | null; phone: string | null; is_primary: number; notes: string | null }
export type DealerEvent = { id: number; event: string; detail: Record<string, unknown> | string | null; actor: string; created_at: string }

export type DealerDetail = {
  dealer: {
    id: number
    slug: string
    name: string
    status: DealerStatus
    group_id: number | null
    crm_vendor: string | null
    crm_profile: string | null
    address: string | null
    zip_code: string
    public_phone: string | null
    public_url: string | null
    city_state: string | null
    notes: string | null
    go_live_at: string | null
  }
  group: { id: number; slug: string; name: string } | null
  routing: { lat: string | null; lng: string | null; routing_weight: number; total_cap: number | null; monthly_cap: number | null }
  territory: string[]
  filters: {
    min_model_year_enabled: number
    min_model_year: number | null
    max_mileage_enabled: number
    max_mileage: number | null
    in_state_enabled: number
    in_state: string | null
    suppress_inspection: number
  }
  adf: { vehicle_interest: string; lead_type: string | null; provider_service: string; subject: string; vendor_email: string | null; mileage_in_comments: number; estimate_as_price: number; estimate_price_type: string }
  recipients: Recipient[]
  contacts: Contact[]
  events: DealerEvent[]
  leads: { total: number; this_month: number }
}
