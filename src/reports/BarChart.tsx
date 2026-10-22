import { useState } from 'react'

// A horizontal bar chart: one series, one colour, bars growing from a shared baseline,
// the value at each bar's tip. Rows can be marked `muted` (context, e.g. Unassigned) and
// draw in the neutral instead of the series colour; the row label carries identity, so
// colour is never the only cue. Each row is focusable and shows a tooltip on hover or
// focus; every value is also printed at the bar tip and in the table beside the chart.

export type BarRow = {
  key: string
  label: string
  value: number | null
  display: string // the value as shown at the tip
  detail?: string // extra line for the tooltip
  muted?: boolean
}

type Props = {
  title: string
  caption?: string
  rows: BarRow[]
  unit: string // for the screen-reader summary, e.g. "miles"
}

export default function BarChart({ title, caption, rows, unit }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0))

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        {caption ? <span className="chart-caption">{caption}</span> : null}
      </figcaption>
      <div className="bars" role="list" aria-label={`${title}, in ${unit}`}>
        {rows.map((r) => {
          const pct = max && r.value ? Math.max((r.value / max) * 100, 1) : 0
          const isActive = active === r.key
          return (
            <div
              key={r.key}
              role="listitem"
              tabIndex={0}
              className={`bar-row${r.muted ? ' muted-row' : ''}${isActive ? ' active' : ''}`}
              aria-label={`${r.label}: ${r.display}`}
              onPointerEnter={() => setActive(r.key)}
              onPointerLeave={() => setActive((k) => (k === r.key ? null : k))}
              onFocus={() => setActive(r.key)}
              onBlur={() => setActive((k) => (k === r.key ? null : k))}
            >
              <span className="bar-label">{r.label}</span>
              <span className="bar-track">
                {/* The plot is the track minus room reserved for the value, so bar lengths
                    stay proportional and the longest bar's value still fits at its tip. */}
                <span className="bar-plot">
                  {r.value != null ? <span className="bar" style={{ width: `${pct}%` }} /> : null}
                  <span className="bar-value">{r.value == null ? 'No data' : r.display}</span>
                </span>
                {isActive ? (
                  <span className="bar-tip" role="tooltip">
                    <strong>{r.value == null ? 'No data' : r.display}</strong>
                    <span>{r.label}</span>
                    {r.detail ? <span className="muted">{r.detail}</span> : null}
                  </span>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}
