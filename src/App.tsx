import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import logo from './assets/vendeloya-logo.png'
import './App.css'
import { API_BASE } from './api'
import Reports from './reports/Reports'

type Lead = {
  id: number
  created_at: string | null
  first_name: string | null
  last_name: string | null
  email_address: string | null
  phone_number: string | null
  current_mileage: string | null
  make: string | null
  model: string | null
  model_year: string | null
  state: string | null
  zip_code: string | null
  stage: string | null
  adjusted_whole_avg: number | null
  adjusted_whole_rough: number | null
  adjusted_whole_clean: number | null
  adjusted_whole_xclean: number | null
  adjusted_tradein_rough: number | null
  adjusted_retail_rough: number | null
  adjusted_tradein_avg: number | null
  adjusted_retail_avg: number | null
  adjusted_tradein_clean: number | null
  adjusted_retail_xclean: number | null
}

type ApiResponse = {
  data: Lead[]
}

type SortKey =
  | 'created_at'
  | 'name'
  | 'current_mileage'
  | 'make'
  | 'state'

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'created_at', label: 'Date' },
  { key: 'name', label: 'Name' },
  { key: 'current_mileage', label: 'Mileage' },
  { key: 'make', label: 'Vehicle' },
  { key: 'state', label: 'State' },
]

// The backend URL lives in api.ts (override locally with VITE_API_BASE in .env.local,
// e.g. http://localhost:3000/api/v1).
// The session token from POST /auth/login, sent as a Bearer token on every request.
// sessionStorage: it's gone when the tab closes, and the server expires it after 12h.
const TOKEN_KEY = 'portal-token'
const MOBILE_BREAKPOINT = 740

const toNumber = (value: string | null): number | null => {
  if (!value) {
    return null
  }

  const numeric = Number(value)
  return Number.isNaN(numeric) ? null : numeric
}

const normalize = (value: string | null): string => (value ?? '').trim()

const formatDate = (value: string | null): string => {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date)
}

const formatMileage = (value: string | null): string => {
  const numeric = toNumber(value)
  return numeric === null ? '-' : `${numeric.toLocaleString()} mi`
}

const formatCurrency = (value: number | null): string => {
  if (value === null) {
    return '-'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

const escapeCsvValue = (value: string | number | null): string => {
  const normalized = value === null ? '' : String(value)
  const escaped = normalized.replaceAll('"', '""')
  return `"${escaped}"`
}

const hasContactInfo = (lead: Lead): boolean => {
  return Boolean(
    normalize(lead.first_name) &&
      normalize(lead.last_name) &&
      normalize(lead.email_address) &&
      normalize(lead.phone_number),
  )
}

const hasOffer = (lead: Lead): boolean => {
  const offerValues = [
    lead.adjusted_whole_avg,
    lead.adjusted_whole_rough,
    lead.adjusted_whole_clean,
    lead.adjusted_whole_xclean,
    lead.adjusted_tradein_rough,
    lead.adjusted_retail_rough,
    lead.adjusted_tradein_avg,
    lead.adjusted_retail_avg,
    lead.adjusted_tradein_clean,
    lead.adjusted_retail_xclean,
  ]

  return offerValues.some((value) => value !== null)
}

const isQualifiedLead = (lead: Lead): boolean => hasContactInfo(lead) && hasOffer(lead)

const getStartOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

const formatDelta = (current: number, previous: number): string => {
  const diff = current - previous
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toLocaleString()} vs previous period`
}

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [token, setToken] = useState<string | null>(sessionStorage.getItem(TOKEN_KEY))
  const isAuthenticated = Boolean(token)
  const [view, setView] = useState<'leads' | 'reports'>('leads')

  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [yearSearch, setYearSearch] = useState('')
  const [makeSearch, setMakeSearch] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [mileageMin, setMileageMin] = useState('')
  const [mileageMax, setMileageMax] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false)

  // Back to the sign-in screen, e.g. when the server says the token is no longer valid.
  const signOutLocally = useCallback((message = '') => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setPassword('')
    setAuthError(message)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)

    const syncViewportMode = (matches: boolean) => {
      setIsMobileViewport(matches)
      setIsMobileFiltersOpen(!matches)
    }

    syncViewportMode(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      syncViewportMode(event.matches)
    }

    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    let isMounted = true

    const fetchLeads = async () => {
      setIsLoading(true)
      setLoadError('')

      try {
        const response = await fetch(`${API_BASE}/user`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.status === 401) {
          if (isMounted) signOutLocally('Your session has expired. Please sign in again.')
          return
        }
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`)
        }

        const payload: ApiResponse = await response.json()
        if (!isMounted) {
          return
        }

        setLeads(Array.isArray(payload.data) ? payload.data : [])
      } catch (error) {
        if (!isMounted) {
          return
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load leads from API.',
        )
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void fetchLeads()

    return () => {
      isMounted = false
    }
  }, [token, signOutLocally])

  const states = useMemo(() => {
    return [...new Set(leads.map((lead) => normalize(lead.state)).filter(Boolean))]
  }, [leads])

  const filteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const yearQuery = yearSearch.trim().toLowerCase()
    const makeQuery = makeSearch.trim().toLowerCase()
    const modelQuery = modelSearch.trim().toLowerCase()
    const minMileage = mileageMin ? Number(mileageMin) : null
    const maxMileage = mileageMax ? Number(mileageMax) : null
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null
    const toTime = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null

    return leads
      .filter((lead) => {
        const fullName = `${normalize(lead.first_name)} ${normalize(lead.last_name)}`
          .trim()
          .toLowerCase()
        const mileage = toNumber(lead.current_mileage)
        const created = lead.created_at ? new Date(lead.created_at).getTime() : null

        const matchesQuery =
          !query ||
          [
            fullName,
            normalize(lead.email_address).toLowerCase(),
            normalize(lead.phone_number).toLowerCase(),
            normalize(lead.make).toLowerCase(),
            normalize(lead.model).toLowerCase(),
            normalize(lead.zip_code).toLowerCase(),
            normalize(lead.state).toLowerCase(),
          ].some((value) => value.includes(query))

        const matchesState =
          stateFilter === 'all' || normalize(lead.state) === stateFilter
        const matchesYear = !yearQuery || normalize(lead.model_year).toLowerCase().includes(yearQuery)
        const matchesMake = !makeQuery || normalize(lead.make).toLowerCase().includes(makeQuery)
        const matchesModel = !modelQuery || normalize(lead.model).toLowerCase().includes(modelQuery)

        const matchesMinMileage = minMileage === null || (mileage ?? -1) >= minMileage
        const matchesMaxMileage = maxMileage === null || (mileage ?? Infinity) <= maxMileage

        const matchesFromDate =
          fromTime === null || (created !== null && created >= fromTime)
        const matchesToDate = toTime === null || (created !== null && created <= toTime)

        return (
          matchesQuery &&
          matchesState &&
          matchesYear &&
          matchesMake &&
          matchesModel &&
          matchesMinMileage &&
          matchesMaxMileage &&
          matchesFromDate &&
          matchesToDate
        )
      })
      .sort((a, b) => {
        let aValue: string | number | null = null
        let bValue: string | number | null = null

        if (sortKey === 'created_at') {
          aValue = a.created_at ? new Date(a.created_at).getTime() : null
          bValue = b.created_at ? new Date(b.created_at).getTime() : null
        }

        if (sortKey === 'name') {
          aValue = `${normalize(a.first_name)} ${normalize(a.last_name)}`.trim()
          bValue = `${normalize(b.first_name)} ${normalize(b.last_name)}`.trim()
        }

        if (sortKey === 'current_mileage') {
          aValue = toNumber(a.current_mileage)
          bValue = toNumber(b.current_mileage)
        }

        if (sortKey === 'make') {
          aValue = `${normalize(a.make)} ${normalize(a.model)}`.trim()
          bValue = `${normalize(b.make)} ${normalize(b.model)}`.trim()
        }

        if (sortKey === 'state') {
          aValue = normalize(a.state)
          bValue = normalize(b.state)
        }

        if (aValue === bValue) {
          return 0
        }

        if (aValue === null) {
          return 1
        }

        if (bValue === null) {
          return -1
        }

        const result =
          typeof aValue === 'number' && typeof bValue === 'number'
            ? aValue - bValue
            : String(aValue).localeCompare(String(bValue))

        return sortDirection === 'asc' ? result : result * -1
      })
  }, [
    leads,
    searchTerm,
    stateFilter,
    yearSearch,
    makeSearch,
    modelSearch,
    mileageMin,
    mileageMax,
    fromDate,
    toDate,
    sortKey,
    sortDirection,
  ])

  const baseFilteredLeads = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const yearQuery = yearSearch.trim().toLowerCase()
    const makeQuery = makeSearch.trim().toLowerCase()
    const modelQuery = modelSearch.trim().toLowerCase()
    const minMileage = mileageMin ? Number(mileageMin) : null
    const maxMileage = mileageMax ? Number(mileageMax) : null

    return leads.filter((lead) => {
      const fullName = `${normalize(lead.first_name)} ${normalize(lead.last_name)}`
        .trim()
        .toLowerCase()
      const mileage = toNumber(lead.current_mileage)

      const matchesQuery =
        !query ||
        [
          fullName,
          normalize(lead.email_address).toLowerCase(),
          normalize(lead.phone_number).toLowerCase(),
          normalize(lead.make).toLowerCase(),
          normalize(lead.model).toLowerCase(),
          normalize(lead.zip_code).toLowerCase(),
          normalize(lead.state).toLowerCase(),
        ].some((value) => value.includes(query))

      const matchesState =
        stateFilter === 'all' || normalize(lead.state) === stateFilter
      const matchesYear = !yearQuery || normalize(lead.model_year).toLowerCase().includes(yearQuery)
      const matchesMake = !makeQuery || normalize(lead.make).toLowerCase().includes(makeQuery)
      const matchesModel = !modelQuery || normalize(lead.model).toLowerCase().includes(modelQuery)
      const matchesMinMileage = minMileage === null || (mileage ?? -1) >= minMileage
      const matchesMaxMileage = maxMileage === null || (mileage ?? Infinity) <= maxMileage

      return (
        matchesQuery &&
        matchesState &&
        matchesYear &&
        matchesMake &&
        matchesModel &&
        matchesMinMileage &&
        matchesMaxMileage
      )
    })
  }, [
    leads,
    searchTerm,
    stateFilter,
    yearSearch,
    makeSearch,
    modelSearch,
    mileageMin,
    mileageMax,
  ])

  const periodMetrics = useMemo(() => {
    const now = new Date()
    const mtdStart = getStartOfMonth(now).getTime()
    const mtdEnd = now.getTime()

    const prevMtdStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const elapsedMsInCurrentMonth = mtdEnd - mtdStart
    const prevMtdStart = prevMtdStartDate.getTime()
    const prevMtdEnd = prevMtdStart + elapsedMsInCurrentMonth

    const hasSelectedRange = Boolean(fromDate && toDate)
    const selectedStart = hasSelectedRange
      ? new Date(`${fromDate}T00:00:00`).getTime()
      : null
    const selectedEnd = hasSelectedRange
      ? new Date(`${toDate}T23:59:59`).getTime()
      : null

    let selectedRecords = 0
    let previousRecords = 0
    let selectedQualified = 0
    let previousQualified = 0

    if (selectedStart !== null && selectedEnd !== null) {
      const selectedLength = selectedEnd - selectedStart + 1
      const previousEnd = selectedStart - 1
      const previousStart = previousEnd - selectedLength + 1

      for (const lead of baseFilteredLeads) {
        const createdTime = lead.created_at ? new Date(lead.created_at).getTime() : null
        if (createdTime === null) {
          continue
        }

        if (createdTime >= selectedStart && createdTime <= selectedEnd) {
          selectedRecords += 1
          if (isQualifiedLead(lead)) {
            selectedQualified += 1
          }
        }

        if (createdTime >= previousStart && createdTime <= previousEnd) {
          previousRecords += 1
          if (isQualifiedLead(lead)) {
            previousQualified += 1
          }
        }
      }
    }

    let qualifiedMtd = 0
    let qualifiedPrevMtd = 0

    for (const lead of leads) {
      if (!isQualifiedLead(lead)) {
        continue
      }

      const createdTime = lead.created_at ? new Date(lead.created_at).getTime() : null
      if (createdTime === null) {
        continue
      }

      if (createdTime >= mtdStart && createdTime <= mtdEnd) {
        qualifiedMtd += 1
      }

      if (createdTime >= prevMtdStart && createdTime <= prevMtdEnd) {
        qualifiedPrevMtd += 1
      }
    }

    return {
      totalQualified: leads.filter(isQualifiedLead).length,
      selectedRecords,
      previousRecords,
      selectedQualified,
      previousQualified,
      qualifiedMtd,
      qualifiedPrevMtd,
      hasSelectedRange,
    }
  }, [baseFilteredLeads, leads, fromDate, toDate])

  // Signs in against the backend (POST /auth/login), which checks the password and returns
  // a session token. Nothing secret lives in this app's code or build.
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSigningIn(true)
    setAuthError('')

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const payload = await response.json().catch(() => ({}))

      if (response.ok && payload.token) {
        sessionStorage.setItem(TOKEN_KEY, payload.token)
        setToken(payload.token)
        setPassword('')
        return
      }
      setAuthError(
        response.status === 429
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : 'Invalid email or password.',
      )
    } catch {
      setAuthError('Could not reach the server. Please try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  // Revokes the session on the server too, so the token is dead even if it was copied.
  const logout = () => {
    if (token) {
      void fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    signOutLocally()
    setEmail('')
  }

  const clearFilters = () => {
    setSearchTerm('')
    setStateFilter('all')
    setYearSearch('')
    setMakeSearch('')
    setModelSearch('')
    setFromDate('')
    setToDate('')
    setMileageMin('')
    setMileageMax('')
  }

  const downloadCsv = () => {
    const headers = [
      'Date',
      'First Name',
      'Last Name',
      'Year',
      'Make',
      'Model',
      'Mileage',
      'State',
      'Zip',
      'Adjusted Whole Avg',
      'Email',
      'Phone',
    ]

    const rows = filteredLeads.map((lead) => {
      return [
        formatDate(lead.created_at),
        normalize(lead.first_name),
        normalize(lead.last_name),
        normalize(lead.model_year),
        normalize(lead.make),
        normalize(lead.model),
        lead.current_mileage ?? '',
        normalize(lead.state),
        normalize(lead.zip_code),
        lead.adjusted_whole_avg,
        normalize(lead.email_address),
        normalize(lead.phone_number),
      ]
    })

    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(','))
      .join('\n')

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)

    link.href = url
    link.download = `leads-${today}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const updateSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  if (!isAuthenticated) {
    return (
      <main className="login-layout">
        <section className="login-card">
          <img src={logo} className="brand-logo" alt="Vendeloya" />          
          <p className="subtitle">Secure access to lead intake and vehicle signals.</p>

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {authError ? <p className="error">{authError}</p> : null}
            <button type="submit" disabled={isSigningIn}>
              {isSigningIn ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-layout">
      <header className="portal-header">
        <div className="header-brand">
          <img src={logo} className="brand-logo" alt="Vendeloya" />
          <div>
            <h1 className="header-title">Dashboard</h1>
            <p className="header-subtitle">Live lead intelligence and pipeline activity</p>
          </div>
        </div>
        <div className="header-actions">
          <nav className="view-tabs" aria-label="Sections">
            <button
              type="button"
              className={view === 'leads' ? 'view-tab active' : 'view-tab'}
              onClick={() => setView('leads')}
            >
              Leads
            </button>
            <button
              type="button"
              className={view === 'reports' ? 'view-tab active' : 'view-tab'}
              onClick={() => setView('reports')}
            >
              Reports
            </button>
          </nav>
          <button type="button" className="ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {view === 'reports' && token ? (
        <Reports token={token} onUnauthorized={signOutLocally} />
      ) : (
      <div className="portal-content">
        <section className="filters-grid">
          <div className="filters-header">
            <h2>Filters</h2>
            <div className="filters-actions">
              <button type="button" className="clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
              {isMobileViewport ? (
                <button
                  type="button"
                  className="filters-toggle"
                  onClick={() => setIsMobileFiltersOpen((prev) => !prev)}
                  aria-expanded={isMobileFiltersOpen}
                  aria-controls="filters-fields"
                >
                  {isMobileFiltersOpen ? 'Hide' : 'Show'}
                </button>
              ) : null}
            </div>
          </div>

          <div
            id="filters-fields"
            className={`filters-fields ${
              isMobileViewport && !isMobileFiltersOpen ? 'is-collapsed' : ''
            }`}
          >
            <label>
              Search
              <input
                type="search"
                placeholder="Name, email, phone, make, model, zip"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>

            <label>
              State
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
              >
                <option value="all">All states</option>
                {states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Year
              <input
                type="search"
                placeholder="ex: 2023"
                value={yearSearch}
                onChange={(event) => setYearSearch(event.target.value)}
              />
            </label>

            <label>
              Make
              <input
                type="search"
                placeholder="ex: Toyota"
                value={makeSearch}
                onChange={(event) => setMakeSearch(event.target.value)}
              />
            </label>

            <label>
              Model
              <input
                type="search"
                placeholder="ex: Tacoma"
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
              />
            </label>

            <label>
              Date from
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>

            <label>
              Date to
              <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>

            <label>
              Mileage min
              <input
                type="number"
                min={0}
                value={mileageMin}
                onChange={(event) => setMileageMin(event.target.value)}
                placeholder="0"
              />
            </label>

            <label>
              Mileage max
              <input
                type="number"
                min={0}
                value={mileageMax}
                onChange={(event) => setMileageMax(event.target.value)}
                placeholder="300000"
              />
            </label>
          </div>
        </section>

        <section className="table-section">
          <div className="kpi-grid">
            <article className="kpi-card">
              <p className="kpi-label">Records Shown</p>
              <p className="kpi-value">{filteredLeads.length.toLocaleString()}</p>
              <p className="kpi-delta">
                {periodMetrics.hasSelectedRange
                  ? formatDelta(periodMetrics.selectedRecords, periodMetrics.previousRecords)
                  : 'Select a date range to see period delta'}
              </p>
            </article>

            <article className="kpi-card">
              <p className="kpi-label">Total Qualified Leads</p>
              <p className="kpi-value">{periodMetrics.totalQualified.toLocaleString()}</p>
              <p className="kpi-delta">Contact + offer across all records</p>
            </article>

            <article className="kpi-card">
              <p className="kpi-label">Qualified Leads (MTD)</p>
              <p className="kpi-value">{periodMetrics.qualifiedMtd.toLocaleString()}</p>
              <p className="kpi-delta">
                {formatDelta(periodMetrics.qualifiedMtd, periodMetrics.qualifiedPrevMtd)}
              </p>
            </article>

            <article className="kpi-card">
              <p className="kpi-label">Qualified Leads (Selected Range)</p>
              <p className="kpi-value">{periodMetrics.selectedQualified.toLocaleString()}</p>
              <p className="kpi-delta">
                {periodMetrics.hasSelectedRange
                  ? formatDelta(periodMetrics.selectedQualified, periodMetrics.previousQualified)
                  : 'Set both Date from and Date to'}
              </p>
            </article>
          </div>

          <div className="table-meta">
            <p>{filteredLeads.length.toLocaleString()} records shown</p>
            <div className="meta-actions">
              {isLoading ? <p>Loading API data...</p> : null}
              <button type="button" className="download-csv" onClick={downloadCsv}>
                Download CSV
              </button>
            </div>
          </div>

          <div className="sort-controls">
            <label>
              Sort by
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <a
              href="#"
              className="sort-direction-link"
              onClick={(event) => {
                event.preventDefault()
                setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
              }}
            >
              {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            </a>
          </div>

          {loadError ? <p className="error">{loadError}</p> : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => updateSort('created_at')}>
                      Date
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => updateSort('name')}>
                      Name
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => updateSort('current_mileage')}>
                      Mileage
                    </button>
                  </th>
                  <th>
                    Year
                  </th>
                  <th>
                    <button type="button" onClick={() => updateSort('make')}>
                      Make
                    </button>
                  </th>
                  <th>Model</th>
                  <th>
                    <button type="button" onClick={() => updateSort('state')}>
                      State
                    </button>
                  </th>
                  <th>Adj Whole Avg</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const fullName = `${normalize(lead.first_name)} ${normalize(lead.last_name)}`.trim()

                  return (
                    <tr key={lead.id}>
                      <td>{formatDate(lead.created_at)}</td>
                      <td>{fullName || '-'}</td>
                      <td>{formatMileage(lead.current_mileage)}</td>
                      <td>{normalize(lead.model_year) || '-'}</td>
                      <td>{normalize(lead.make) || '-'}</td>
                      <td>{normalize(lead.model) || '-'}</td>
                      <td>
                        {normalize(lead.state) || '-'} {normalize(lead.zip_code) || ''}
                      </td>
                      <td>{formatCurrency(lead.adjusted_whole_avg)}</td>
                      <td>
                        <div>{normalize(lead.email_address) || '-'}</div>
                        <div>{normalize(lead.phone_number) || '-'}</div>
                      </td>
                    </tr>
                  )
                })}

                {!isLoading && filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="empty-row">
                      No leads match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mobile-leads">
            {filteredLeads.map((lead) => {
              const fullName = `${normalize(lead.first_name)} ${normalize(lead.last_name)}`.trim()
              const vehicle =
                `${normalize(lead.model_year)} ${normalize(lead.make)} ${normalize(lead.model)}`.trim()

              return (
                <article key={`mobile-${lead.id}`} className="lead-card">
                  <div className="lead-card-top">
                    <p className="lead-name">{fullName || '-'}</p>
                    <p className="lead-date">{formatDate(lead.created_at)}</p>
                  </div>
                  <p className="lead-vehicle">{vehicle || '-'}</p>

                  <div className="lead-facts">
                    <div>
                      <span>Mileage</span>
                      <strong>{formatMileage(lead.current_mileage)}</strong>
                    </div>
                    <div>
                      <span>Location</span>
                      <strong>
                        {normalize(lead.state) || '-'} {normalize(lead.zip_code) || ''}
                      </strong>
                    </div>
                    <div>
                      <span>Adj Whole Avg</span>
                      <strong>{formatCurrency(lead.adjusted_whole_avg)}</strong>
                    </div>
                    <div>
                      <span>Email</span>
                      <strong>{normalize(lead.email_address) || '-'}</strong>
                    </div>
                    <div>
                      <span>Phone</span>
                      <strong>{normalize(lead.phone_number) || '-'}</strong>
                    </div>
                  </div>
                </article>
              )
            })}

            {!isLoading && filteredLeads.length === 0 ? (
              <p className="empty-row">No leads match the current filters.</p>
            ) : null}
          </div>
        </section>
      </div>
      )}
    </main>
  )
}

export default App
