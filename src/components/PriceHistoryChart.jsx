import { useMemo, useRef, useState } from 'react'

// Defensive parser: Collectr's price_history can come back in several shapes,
// so try a few common ones. Returns [{ gradeId, points: [{x, y}] }, ...]
export function extractPriceSeries(history) {
  if (!history) return []

  const toPoint = (p) => {
    const x = p.insertion_date || p.inserted_at || p.date || p.timestamp || p.day || p.t || p.x || p.created_at
    const y = parseFloat(
      p.price ?? p.market_price ?? p.value ?? p.y ?? p.median ?? p.amount
    )
    if (!x || Number.isNaN(y)) return null
    return { x, y }
  }

  if (Array.isArray(history)) {
    if (history.length === 0) return []
    if (history[0]?.points || history[0]?.history || history[0]?.data) {
      return history
        .map(s => ({
          gradeId: s.grade_id ?? s.gradeId ?? s.id ?? '52',
          points: (s.points || s.history || s.data || []).map(toPoint).filter(Boolean)
        }))
        .filter(s => s.points.length > 0)
    }
    const grouped = {}
    for (const p of history) {
      const gid = p.grade_id ?? p.gradeId ?? '52'
      const pt = toPoint(p)
      if (!pt) continue
      ;(grouped[gid] ||= []).push(pt)
    }
    return Object.entries(grouped).map(([gradeId, points]) => ({ gradeId, points }))
  }

  if (typeof history === 'object') {
    if (history.variants) return extractPriceSeries(history.variants)
    if (history.series) return extractPriceSeries(history.series)
    if (history.points) return extractPriceSeries([history])
    return Object.entries(history)
      .map(([gradeId, val]) => ({
        gradeId,
        points: Array.isArray(val) ? val.map(toPoint).filter(Boolean) : []
      }))
      .filter(s => s.points.length > 0)
  }

  return []
}

const COLORS = ['#9b7eff', '#86e1c0', '#f5a623', '#ff6b6b', '#4dabf7', '#c9b6ff', '#ffd166', '#06d6a0', '#ef476f']
const RAW_COLOR = '#86e1c0'

const colorFor = (gradeId, fallbackIndex) =>
  String(gradeId) === '52' ? RAW_COLOR : COLORS[fallbackIndex % COLORS.length]

const DAY_MS = 86400000

const RANGE_OPTIONS = [
  { key: '1D',  label: '1D',  days: 1 },
  { key: '1W',  label: '1W',  days: 7 },
  { key: '1M',  label: '1M',  days: 30 },
  { key: '3M',  label: '3M',  days: 90 },
  { key: '1Y',  label: '1Y',  days: 365 },
  { key: 'MAX', label: 'Max', days: Infinity }
]

const fmtDate = (x) => {
  const d = new Date(x)
  if (Number.isNaN(+d)) return String(x)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

const fmtDuration = (ms) => {
  const days = Math.max(0, Math.round(ms / DAY_MS))
  if (days === 0) return 'same day'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  const remDays = days - months * 30
  const monthStr = `${months} month${months === 1 ? '' : 's'}`
  if (months >= 12) {
    const years = Math.floor(months / 12)
    const remMonths = months - years * 12
    const yStr = `${years} year${years === 1 ? '' : 's'}`
    return remMonths > 0 ? `${yStr} ${remMonths} mo` : yStr
  }
  return remDays > 0 ? `${monthStr} ${remDays} d` : monthStr
}

const fmtMoney = (v) => `A$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function PriceHistoryChart({
  series,
  markers = [],
  exchangeRate = 1,
  gradeLabel,
  height = 260,
  lockedLegend = false,
  defaultRange = '1M'
}) {
  const [hidden, setHidden] = useState(() => new Set())
  const [range, setRange] = useState(defaultRange)
  const [hoverVx, setHoverVx] = useState(null)         // current hover viewBox x
  const [drag, setDrag] = useState(null)               // { startVx, currentVx } while pointer is held
  const [selection, setSelection] = useState(null)     // { startVx, endVx } locked after pointer up
  const [hoverMarker, setHoverMarker] = useState(null) // { marker, vx, vy } when hovering a dot
  const svgRef = useRef(null)

  const width = 720
  const padding = { top: 14, right: 18, bottom: 32, left: 56 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  // Most recent timestamp across all source data — defines "now" for the
  // relative range buttons.
  const now = useMemo(() => {
    let max = 0
    series.forEach(s => (s.points || []).forEach(p => {
      const t = +new Date(p.x)
      if (t > max) max = t
    }))
    return max || Date.now()
  }, [series])

  const rangeOpt = RANGE_OPTIONS.find(o => o.key === range) || RANGE_OPTIONS[5]
  const cutoff = rangeOpt.days === Infinity ? -Infinity : now - rangeOpt.days * DAY_MS

  // visible = legend filter + range filter, only keeping series with at least
  // one point left in window.
  const visible = useMemo(() => {
    return series
      .filter(s => s.points && s.points.length > 0 && !hidden.has(String(s.gradeId)))
      .map(s => ({
        ...s,
        points: s.points
          .filter(p => +new Date(p.x) >= cutoff)
          .sort((a, b) => +new Date(a.x) - +new Date(b.x))
      }))
      .filter(s => s.points.length > 0)
  }, [series, hidden, cutoff])

  const allPoints = visible.flatMap(s => s.points)
  const hasData = allPoints.length > 0

  const xs = allPoints.map(p => +new Date(p.x))
  const ys = allPoints.map(p => p.y * exchangeRate)
  const xMin = hasData ? Math.min(...xs) : 0
  const xMax = hasData ? Math.max(...xs) : 1
  const yMin = hasData ? Math.min(...ys, 0) : 0
  const yMax = hasData ? Math.max(...ys) : 1
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const xScale = (x) => padding.left + ((+new Date(x) - xMin) / xRange) * chartW
  const yScale = (y) => padding.top + chartH - ((y * exchangeRate - yMin) / yRange) * chartH
  const dateAtVx = (vx) => new Date(xMin + ((vx - padding.left) / chartW) * xRange)

  const ticks = 4
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yMin + (yRange * i) / ticks)
  const xTickCount = 4
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => xMin + (xRange * i) / xTickCount)

  const toggle = (gid) => {
    const next = new Set(hidden)
    const k = String(gid)
    if (next.has(k)) next.delete(k); else next.add(k)
    setHidden(next)
  }

  // Convert a pointer event into the SVG viewBox X (clamped to chart area)
  const getViewBoxX = (e) => {
    const svg = svgRef.current
    if (!svg) return padding.left
    const rect = svg.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * width
    return Math.max(padding.left, Math.min(padding.left + chartW, vx))
  }

  const onPointerMove = (e) => {
    if (!hasData) return
    const vx = getViewBoxX(e)
    setHoverVx(vx)
    if (drag) setDrag({ startVx: drag.startVx, currentVx: vx })
  }
  const onPointerDown = (e) => {
    if (!hasData) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const vx = getViewBoxX(e)
    setDrag({ startVx: vx, currentVx: vx })
    setSelection(null)
  }
  const onPointerUp = (e) => {
    if (!drag) return
    const vx = getViewBoxX(e)
    const distance = Math.abs(vx - drag.startVx)
    if (distance > 3) {
      setSelection({
        startVx: Math.min(drag.startVx, vx),
        endVx: Math.max(drag.startVx, vx)
      })
    } else {
      setSelection(null) // pure click → dismiss any selection
    }
    setDrag(null)
  }
  const onPointerLeave = () => {
    setHoverVx(null)
    if (drag) setDrag(null)
  }

  // For the hover tooltip: nearest point per visible series at the cursor x
  const valueAtVxForSeries = (vx, s) => {
    if (!s.points.length) return null
    const target = +dateAtVx(vx)
    let nearest = null, nearestDist = Infinity
    for (const p of s.points) {
      const dist = Math.abs(+new Date(p.x) - target)
      if (dist < nearestDist) { nearest = p; nearestDist = dist }
    }
    return nearest
  }

  // Buy/sell markers placed on top of the price lines. Skip any marker whose
  // grade isn't in `visible` or whose approxDate falls outside current window.
  const placedMarkers = (markers || [])
    .map(m => {
      const s = visible.find(v => String(v.gradeId) === String(m.gradeId))
      if (!s) return null
      const t = +new Date(m.approxDate)
      if (!Number.isFinite(t) || t < xMin || t > xMax) return null
      // Snap to the nearest series point so the dot sits on the line.
      let nearest = null, nearestDist = Infinity
      for (const p of s.points) {
        const dist = Math.abs(+new Date(p.x) - t)
        if (dist < nearestDist) { nearest = p; nearestDist = dist }
      }
      if (!nearest) return null
      return {
        ...m,
        vx: xScale(nearest.x),
        vy: yScale(nearest.y),
        priceAUD: nearest.y * exchangeRate
      }
    })
    .filter(Boolean)

  const hoverInfo = (hoverVx != null && hasData) ? {
    vx: hoverVx,
    date: dateAtVx(hoverVx),
    perSeries: visible.map(s => ({ s, p: valueAtVxForSeries(hoverVx, s) })).filter(x => x.p)
  } : null

  // Selection summary (locked after release)
  const selectionInfo = (selection && hasData) ? (() => {
    const startDate = dateAtVx(selection.startVx)
    const endDate = dateAtVx(selection.endVx)
    return {
      startDate, endDate,
      durationMs: +endDate - +startDate,
      perSeries: visible.map(s => {
        const sp = valueAtVxForSeries(selection.startVx, s)
        const ep = valueAtVxForSeries(selection.endVx, s)
        if (!sp || !ep) return null
        const startUSD = sp.y, endUSD = ep.y
        const deltaUSD = endUSD - startUSD
        const deltaPct = startUSD > 0 ? (deltaUSD / startUSD) * 100 : 0
        return {
          s, sp, ep,
          startAUD: startUSD * exchangeRate,
          endAUD: endUSD * exchangeRate,
          deltaAUD: deltaUSD * exchangeRate,
          deltaPct
        }
      }).filter(Boolean)
    }
  })() : null

  // Live drag rectangle (while user is still dragging)
  const liveDragRect = (drag && Math.abs(drag.currentVx - drag.startVx) > 1) ? {
    x: Math.min(drag.startVx, drag.currentVx),
    width: Math.abs(drag.currentVx - drag.startVx)
  } : null

  return (
    <div>
      {/* Range buttons */}
      <div style={{
        display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.65rem'
      }}>
        {RANGE_OPTIONS.map(opt => {
          const active = range === opt.key
          return (
            <button
              key={opt.key}
              onClick={() => { setRange(opt.key); setSelection(null) }}
              style={{
                padding: '0.32rem 0.7rem',
                background: active ? 'rgba(155,126,255,0.10)' : 'transparent',
                border: active ? '1px solid var(--accent)' : '1px solid var(--rule)',
                color: active ? 'var(--fg-0)' : 'var(--fg-2)',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.66rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 160ms'
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      {!lockedLegend && (
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.55rem',
        marginBottom: '0.75rem'
      }}>
        {series.map((s, i) => {
          const color = colorFor(s.gradeId, i)
          const label = gradeLabel(s.gradeId)
          const isHidden = hidden.has(String(s.gradeId))
          const lastPoint = s.points[s.points.length - 1]
          const lastPriceAud = lastPoint ? lastPoint.y * exchangeRate : null
          return (
            <button
              key={String(s.gradeId)}
              onClick={() => toggle(s.gradeId)}
              style={{
                background: 'transparent',
                border: '1px solid var(--rule)',
                color: isHidden ? 'var(--fg-3)' : 'var(--fg-0)',
                padding: '0.32rem 0.6rem',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em',
                opacity: isHidden ? 0.55 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem'
              }}
              aria-pressed={!isHidden}
            >
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: isHidden ? 'transparent' : color,
                border: `1px solid ${color}`
              }} />
              <span>{label.label}</span>
              {lastPriceAud != null && (
                <span style={{ color: 'var(--fg-3)' }}>
                  · A${lastPriceAud.toFixed(2)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      )}

      {/* Selection summary */}
      {selectionInfo && (
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--rule-strong)',
          borderRadius: '4px',
          padding: '0.7rem 0.85rem',
          marginBottom: '0.7rem',
          fontSize: '0.78rem',
          fontFamily: 'var(--font-mono)'
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: selectionInfo.perSeries.length ? '0.45rem' : 0
          }}>
            <span style={{ color: 'var(--fg-1)' }}>
              {fmtDate(selectionInfo.startDate)} → {fmtDate(selectionInfo.endDate)}
              <span style={{ color: 'var(--fg-3)' }}>
                {' '}· {fmtDuration(selectionInfo.durationMs)}
              </span>
            </span>
            <button
              onClick={() => setSelection(null)}
              style={{
                background: 'transparent', border: 'none', color: 'var(--fg-3)',
                cursor: 'pointer', fontSize: '0.78rem', padding: 0
              }}
              aria-label="Clear selection"
            >×</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {selectionInfo.perSeries.map(({ s, deltaAUD, deltaPct, startAUD, endAUD }, i) => {
              const colorIndex = series.findIndex(x => String(x.gradeId) === String(s.gradeId))
              const color = colorFor(s.gradeId, colorIndex)
              const up = deltaAUD >= 0
              const sign = up ? '+' : '−'
              const deltaColor = up ? 'var(--mint, #86e1c0)' : 'var(--danger, #ff6b6b)'
              const label = gradeLabel(s.gradeId).label
              return (
                <div key={String(s.gradeId)} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                    {label}
                    <span style={{ color: 'var(--fg-3)' }}>
                      {' '}{fmtMoney(startAUD)} → {fmtMoney(endAUD)}
                    </span>
                  </span>
                  <span style={{ color: deltaColor }}>
                    {sign}{fmtMoney(Math.abs(deltaAUD))} ({sign}{Math.abs(deltaPct).toFixed(2)}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Chart with hover overlay */}
      <div style={{ position: 'relative' }}>
        {!hasData ? (
          <p style={{
            color: 'var(--fg-3)', fontSize: '0.85rem', fontStyle: 'italic',
            textAlign: 'center', padding: '2rem 1rem', margin: 0
          }}>
            No data in this window. Pick a wider range or enable a series.
          </p>
        ) : (
          <>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${width} ${height}`}
              style={{
                width: '100%', height: 'auto', display: 'block',
                touchAction: 'none', cursor: drag ? 'col-resize' : 'crosshair'
              }}
              onPointerMove={onPointerMove}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onPointerCancel={onPointerLeave}
            >
              {/* y grid + labels */}
              {yTicks.map((yt, i) => {
                const y = yScale(yt / exchangeRate)
                return (
                  <g key={i}>
                    <line
                      x1={padding.left} x2={padding.left + chartW}
                      y1={y} y2={y}
                      stroke="rgba(255,255,255,0.06)" strokeWidth="1"
                    />
                    <text
                      x={padding.left - 8} y={y + 4}
                      textAnchor="end"
                      fill="var(--fg-3)" fontSize="10"
                      fontFamily="ui-monospace, Menlo, monospace"
                    >A${yt.toFixed(0)}</text>
                  </g>
                )
              })}
              {/* x labels */}
              {xTicks.map((xt, i) => {
                const x = xScale(xt)
                return (
                  <text
                    key={i}
                    x={x} y={height - 10}
                    textAnchor="middle"
                    fill="var(--fg-3)" fontSize="10"
                    fontFamily="ui-monospace, Menlo, monospace"
                  >{fmtDate(xt)}</text>
                )
              })}

              {/* Locked selection rectangle */}
              {selection && (
                <rect
                  x={selection.startVx}
                  y={padding.top}
                  width={selection.endVx - selection.startVx}
                  height={chartH}
                  fill="rgba(155,126,255,0.12)"
                  stroke="rgba(155,126,255,0.45)"
                  strokeWidth="1"
                />
              )}
              {/* Live drag rectangle */}
              {liveDragRect && (
                <rect
                  x={liveDragRect.x}
                  y={padding.top}
                  width={liveDragRect.width}
                  height={chartH}
                  fill="rgba(155,126,255,0.10)"
                  stroke="rgba(155,126,255,0.35)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

              {/* Lines */}
              {visible.map((s) => {
                const colorIndex = series.findIndex(x => String(x.gradeId) === String(s.gradeId))
                const color = colorFor(s.gradeId, colorIndex)
                const path = s.points.map((p, j) =>
                  `${j === 0 ? 'M' : 'L'} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`
                ).join(' ')
                return (
                  <path
                    key={String(s.gradeId)}
                    d={path}
                    stroke={color} strokeWidth="1.6" fill="none"
                    strokeLinejoin="round" strokeLinecap="round"
                  />
                )
              })}

              {/* Buy/sell markers — triangles snapped to the price line */}
              {placedMarkers.map((m) => {
                const isBuy = m.type === 'buy'
                const fill = isBuy ? '#86e1c0' : '#ff6b6b'
                const stroke = isBuy ? '#3aa37b' : '#c84747'
                // Up triangle for buy, down for sell
                const points = isBuy
                  ? `${m.vx},${m.vy - 6} ${m.vx - 5},${m.vy + 4} ${m.vx + 5},${m.vy + 4}`
                  : `${m.vx},${m.vy + 6} ${m.vx - 5},${m.vy - 4} ${m.vx + 5},${m.vy - 4}`
                return (
                  <g
                    key={m.id}
                    style={{ cursor: 'pointer' }}
                    onPointerEnter={(e) => {
                      e.stopPropagation()
                      setHoverMarker({ marker: m, vx: m.vx, vy: m.vy })
                    }}
                    onPointerLeave={() => setHoverMarker(null)}
                  >
                    <polygon
                      points={points}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth="1"
                    />
                  </g>
                )
              })}

              {/* Hover crosshair + per-series markers */}
              {hoverInfo && !hoverMarker && (
                <>
                  <line
                    x1={hoverInfo.vx} x2={hoverInfo.vx}
                    y1={padding.top} y2={padding.top + chartH}
                    stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="2 3"
                  />
                  {hoverInfo.perSeries.map(({ s, p }) => {
                    const colorIndex = series.findIndex(x => String(x.gradeId) === String(s.gradeId))
                    const color = colorFor(s.gradeId, colorIndex)
                    return (
                      <circle
                        key={String(s.gradeId)}
                        cx={xScale(p.x)} cy={yScale(p.y)}
                        r="3.5"
                        fill="var(--bg-1)"
                        stroke={color} strokeWidth="1.6"
                      />
                    )
                  })}
                </>
              )}
            </svg>

            {/* Marker tooltip — takes priority over the crosshair tooltip */}
            {hoverMarker && (
              <div style={{
                position: 'absolute',
                top: '0.4rem',
                left: `${(hoverMarker.vx / width) * 100}%`,
                transform:
                  hoverMarker.vx > width * 0.7
                    ? 'translateX(calc(-100% - 8px))'
                    : 'translateX(8px)',
                pointerEvents: 'none',
                background: 'rgba(11,11,20,0.94)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: `1px solid ${hoverMarker.marker.type === 'buy' ? '#3aa37b' : '#c84747'}`,
                borderRadius: '4px',
                padding: '0.5rem 0.65rem',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg-1)',
                whiteSpace: 'nowrap',
                zIndex: 2,
                lineHeight: 1.45
              }}>
                <div style={{
                  color: hoverMarker.marker.type === 'buy' ? '#86e1c0' : '#ff6b6b',
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  fontSize: '0.66rem',
                  marginBottom: '0.25rem'
                }}>
                  {hoverMarker.marker.type === 'buy' ? '▲ Bought' : '▼ Sold'}
                </div>
                <div>{hoverMarker.marker.portfolio} · qty {hoverMarker.marker.quantity}</div>
                <div style={{ color: 'var(--fg-3)' }}>
                  {gradeLabel(hoverMarker.marker.gradeId).label} · {fmtMoney(hoverMarker.priceAUD)}
                </div>
                <div style={{ color: 'var(--fg-3)', marginTop: '0.2rem' }}>
                  approx {fmtDate(hoverMarker.marker.approxDate)}
                </div>
              </div>
            )}

            {/* Hover tooltip (HTML, positioned absolutely over the SVG) */}
            {hoverInfo && !drag && !hoverMarker && (
              <div style={{
                position: 'absolute',
                top: '0.4rem',
                left: `${(hoverInfo.vx / width) * 100}%`,
                transform:
                  hoverInfo.vx > width * 0.7
                    ? 'translateX(calc(-100% - 8px))'
                    : 'translateX(8px)',
                pointerEvents: 'none',
                background: 'rgba(11,11,20,0.92)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                border: '1px solid var(--rule-strong)',
                borderRadius: '4px',
                padding: '0.45rem 0.6rem',
                fontSize: '0.74rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--fg-1)',
                whiteSpace: 'nowrap',
                zIndex: 1
              }}>
                <div style={{ color: 'var(--fg-3)', marginBottom: '0.25rem' }}>
                  {fmtDate(hoverInfo.date)}
                </div>
                {hoverInfo.perSeries.map(({ s, p }) => {
                  const colorIndex = series.findIndex(x => String(x.gradeId) === String(s.gradeId))
                  const color = colorFor(s.gradeId, colorIndex)
                  const label = gradeLabel(s.gradeId).label
                  return (
                    <div key={String(s.gradeId)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                      <span style={{ color: 'var(--fg-2)' }}>{label}</span>
                      <span style={{ color: 'var(--fg-0)' }}>{fmtMoney(p.y * exchangeRate)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PriceHistoryChart
