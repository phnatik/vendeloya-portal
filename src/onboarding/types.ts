// Shapes returned by /api/v1/onboarding.

export type OnboardingStatus = 'draft' | 'invited' | 'submitted' | 'applied' | 'rejected'

export type OnboardingForm = {
  id: number
  status: OnboardingStatus
  dealer_id: number | null
  dealer_slug: string | null
  last_error: string | null
  invite_active: boolean
  invite_email: string | null
  invite_expires_at: string | null
  invited_by: string | null
  invited_at: string | null
  submitted_at: string | null
  updated_at: string
  // the form's fields
  [field: string]: unknown
}

export type ProcessResult = { ok: boolean; errors?: string[]; dealer_slug?: string; dryRun?: boolean }
