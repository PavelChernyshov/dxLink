import { createChart } from '@devexperts/dxcharts-lite'
import type { Chart } from '@devexperts/dxcharts-lite'
import { CanvasElement } from '@devexperts/dxcharts-lite/dist/chart/canvas/canvas-bounds-container'
import type { PartialCandle } from '@devexperts/dxcharts-lite/dist/chart/components/chart/chart.component'
import type { Drawer } from '@devexperts/dxcharts-lite/dist/chart/drawers/drawing-manager'
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useRef } from 'react'

import type { DeepBookHeatmap, DeepBookViewModel } from './deepbook-view-model'

const HEIGHT = 420

/** Coerce the `number | 'NaN'` candle fields to a number. */
const num = (value: number | string | undefined): number =>
  typeof value === 'number' ? value : Number(value)

// Opaque Bookmap-style intensity palette, precomputed once into a 256-entry lookup table so per-cell coloring is a
// single array index (no per-draw interpolation). Stops: #0D1524 -> #16407A -> #2E7BC4 -> #3ECFD6 -> #F2C94C -> #E24B4A.
const PALETTE_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0.0, [20, 34, 56]],
  [0.25, [22, 64, 122]],
  [0.5, [46, 123, 196]],
  [0.72, [62, 207, 214]],
  [0.88, [242, 201, 76]],
  [1.0, [226, 75, 74]],
]

const LUT: readonly string[] = (() => {
  const out = new Array<string>(256)
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    let k = 0
    while (k < PALETTE_STOPS.length - 1 && x > PALETTE_STOPS[k + 1]![0]) k++
    const lo = PALETTE_STOPS[k]!
    const hi = PALETTE_STOPS[Math.min(k + 1, PALETTE_STOPS.length - 1)]!
    const span = hi[0] - lo[0]
    const f = span > 0 ? (x - lo[0]) / span : 0
    const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f)
    const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f)
    const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f)
    out[i] = `rgb(${r},${g},${b})`
  }
  return out
})()

/** Value at percentile `p` (0..100) of an ascending-sorted array. */
const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return NaN
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1)))
  )
  return sortedAsc[idx]!
}

/** Percentile cutoffs (0..100) that bound the color scale; adjustable from the UI sliders. */
export interface HeatmapContrast {
  loPct: number
  hiPct: number
}

/**
 * Custom dxcharts-lite drawer that paints the order-book liquidity heatmap on the main canvas.
 *
 * Positioning: candles sit on an index-based axis, so `toXFromTimestamp` quantizes any time to a whole-candle center
 * (with 1m candles that collapses a 1s heatmap onto one column per minute). To keep sub-candle resolution we instead
 * build a piecewise-linear time→x map from the candle centers as knots and interpolate — continuous, and still exact
 * at each candle so it stays aligned on pan/zoom.
 *
 * Color: size is mapped through a log scale between two percentile cutoffs (default p55..p98) of the current book. The
 * cutoffs are computed ONCE and then FROZEN — recomputing them as live data ticks would re-color already-painted cells
 * (as the book grows the cutoffs would rise, fading old bands toward the floor), which reads as history disappearing.
 * A painted cell must keep its color; the scale only re-derives on a slider change (see {@link resetNorm}). Sizes below
 * the low cutoff are clamped to the palette floor (a dim color), not hidden. Bands are drawn as opaque LUT colors sorted
 * ascending by size (painter's "max": a bigger level drawn later wins its pixels), so walls survive overlap.
 */
class HeatmapDrawer implements Drawer {
  private lo = NaN
  private hi = NaN

  constructor(
    private readonly chart: Chart,
    private readonly getHeatmap: () => DeepBookHeatmap | null,
    private readonly getCandleTimestamps: () => number[],
    private readonly getContrast: () => HeatmapContrast
  ) {}

  getCanvasIds(): string[] {
    return [this.chart.mainCanvasModel.canvasId]
  }

  /** Drop the frozen cutoffs so they are re-derived from the current book on the next draw (e.g. after a slider change). */
  resetNorm = (): void => {
    this.lo = NaN
    this.hi = NaN
  }

  /** Piecewise-linear time→x using the candle centers as knots, extrapolating beyond the ends. */
  private buildTimeToX(): ((t: number) => number) | null {
    const ts = this.getCandleTimestamps()
    const n = ts.length
    if (n === 0) return null
    const xs = new Array<number>(n)
    for (let i = 0; i < n; i++) xs[i] = this.chart.data.toXFromTimestamp(ts[i]!)
    if (n === 1) return () => xs[0]!
    return (t: number): number => {
      if (t <= ts[0]!) {
        const slope = (xs[1]! - xs[0]!) / (ts[1]! - ts[0]! || 1)
        return xs[0]! + (t - ts[0]!) * slope
      }
      if (t >= ts[n - 1]!) {
        const slope = (xs[n - 1]! - xs[n - 2]!) / (ts[n - 1]! - ts[n - 2]! || 1)
        return xs[n - 1]! + (t - ts[n - 1]!) * slope
      }
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (ts[mid]! <= t) lo = mid
        else hi = mid
      }
      const f = (t - ts[lo]!) / (ts[hi]! - ts[lo]! || 1)
      return xs[lo]! + (xs[hi]! - xs[lo]!) * f
    }
  }

  draw(): void {
    const heatmap = this.getHeatmap()
    if (heatmap === null || heatmap.segments.length === 0 || !Number.isFinite(heatmap.priceStep))
      return
    const timeToX = this.buildTimeToX()
    if (timeToX === null) return

    const ctx = this.chart.mainCanvasModel.ctx
    const bounds = this.chart.bounds.getBounds(CanvasElement.CHART)
    const left = bounds.x
    const right = bounds.x + bounds.width

    // Project + cull to the visible band once; reuse for both normalization and drawing.
    const visible: { x0: number; x1: number; y: number; size: number }[] = []
    for (const seg of heatmap.segments) {
      if (seg.size <= 0) continue
      const xa = timeToX(seg.tStart)
      const xb = timeToX(seg.tEnd)
      if (!Number.isFinite(xa) || !Number.isFinite(xb)) continue
      const x0 = Math.min(xa, xb)
      const x1 = Math.max(xa, xb)
      if (x1 < left || x0 > right) continue
      const y = this.chart.data.toY(seg.price)
      if (!Number.isFinite(y)) continue
      visible.push({ x0, x1, y, size: seg.size })
    }
    if (visible.length === 0) return

    // Band height that TILES the price axis so the field reads as a heatmap, not 1px hairlines. Use the typical
    // (median) pixel spacing between adjacent visible price levels: dense regions then merge into a continuous field
    // while genuinely sparse outliers keep their gaps. A +1px overlap closes sub-pixel seams. Derived from the live
    // scale (pixel y's), so it tracks zoom.
    let rowH = 3
    const ys = Array.from(new Set(visible.map((v) => Math.round(v.y)))).sort((a, b) => a - b)
    if (ys.length > 1) {
      const gaps: number[] = []
      for (let i = 1; i < ys.length; i++) gaps.push(ys[i]! - ys[i - 1]!)
      gaps.sort((a, b) => a - b)
      rowH = gaps[Math.floor(gaps.length / 2)]!
    }
    rowH = Math.min(16, Math.max(2, rowH)) + 1

    // Derive the percentile cutoffs ONCE from the whole book, then freeze them (see class doc): re-deriving as data
    // ticks would re-color already-painted cells and fade history out. Computed over all segments (not just visible) so
    // the frozen scale is representative regardless of the current zoom.
    if (!Number.isFinite(this.lo)) {
      const { loPct, hiPct } = this.getContrast()
      const sizes: number[] = []
      for (const seg of heatmap.segments) if (seg.size > 0) sizes.push(seg.size)
      sizes.sort((a, b) => a - b)
      this.lo = percentile(sizes, loPct)
      this.hi = percentile(sizes, hiPct)
    }
    const lo = this.lo
    const hi = this.hi
    const logSpan = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? Math.log(hi / lo) : NaN

    // Painter's "max": draw smaller sizes first so larger levels paint over them.
    visible.sort((a, b) => a.size - b.size)

    ctx.save()
    ctx.beginPath()
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.clip()
    for (const seg of visible) {
      let t: number
      if (Number.isFinite(logSpan)) {
        // Map through the log scale, clamping below the low cutoff to the palette floor (dim) rather than hiding it.
        // A resting level is real liquidity; it must stay painted even when the drifting cutoff moves past it, so
        // already-rendered bands never disappear on a later frame. Only intensity varies, not presence.
        t = Math.log(seg.size / lo) / logSpan
        if (t < 0) t = 0
        else if (t > 1) t = 1
      } else {
        t = seg.size >= hi ? 1 : 0
      }
      ctx.fillStyle = LUT[Math.round(t * 255)]!
      const x0 = Math.max(seg.x0, left)
      const x1 = Math.min(seg.x1, right)
      ctx.fillRect(x0, seg.y - rowH / 2, Math.max(1, x1 - x0), rowH)
    }
    ctx.restore()
  }
}

/**
 * dxcharts-lite candle chart for a DeepBook channel with the ORCS order-book liquidity heatmap overlaid underneath the
 * candles, sharing the chart's time and price axes. Candles come from the reference feed (via the VM's candle
 * listener); the heatmap is painted by a custom drawer fed by the VM's heatmap listener. The contrast sliders adjust
 * the percentile cutoffs the heatmap colors are normalized against.
 */
export const DeepBookChart = ({ vm }: { vm: DeepBookViewModel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const contrastRef = useRef<HeatmapContrast>({ loPct: 55, hiPct: 98 })
  const drawerRef = useRef<HeatmapDrawer | null>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const chart = createChart(container)
    chartRef.current = chart
    const heatmapRef: { current: DeepBookHeatmap | null } = { current: null }
    const candles = new Map<string, PartialCandle>()
    let candleTimestamps: number[] = []
    let hasSnapshot = false

    const drawer = new HeatmapDrawer(
      chart,
      () => heatmapRef.current,
      () => candleTimestamps,
      () => contrastRef.current
    )
    drawerRef.current = drawer
    // Paint the heatmap behind the candle series so candles remain readable on top.
    chart.drawingManager.addDrawerBefore(drawer, 'OB_HEATMAP', 'DYNAMIC_OBJECTS')

    vm.setHeatmapListener((heatmap) => {
      heatmapRef.current = heatmap
      chart.mainCanvasModel.fireDraw()
    })

    vm.setCandleListener((data) => {
      if (data.isSnapshot) candles.clear()
      for (const event of data.events) {
        const close = num(event.close)
        if (!Number.isFinite(close)) continue
        const volume = num(event.volume)
        candles.set(String(event.index), {
          id: String(event.index),
          timestamp: event.time,
          open: num(event.open),
          hi: num(event.high),
          lo: num(event.low),
          close,
          volume: Number.isFinite(volume) ? volume : 0,
        })
      }
      const sorted = Array.from(candles.values()).sort((a, b) => a.timestamp - b.timestamp)
      candleTimestamps = sorted.map((c) => c.timestamp)
      const series = { candles: sorted }
      // setData once (initial auto-fit), then updateData so the user's pan/zoom is preserved.
      if (hasSnapshot) {
        chart.updateData(series)
      } else {
        chart.setData(series)
        hasSnapshot = true
      }
    })

    return () => {
      vm.setHeatmapListener(null)
      vm.setCandleListener(null)
      drawerRef.current = null
      chartRef.current = null
      chart.destroy()
    }
  }, [vm])

  const onContrastChange = (next: HeatmapContrast): void => {
    contrastRef.current = next
    drawerRef.current?.resetNorm()
    chartRef.current?.mainCanvasModel.fireDraw()
  }

  return (
    <Stack spacing={1}>
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: HEIGHT,
          bgcolor: 'background.default',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
      </Box>
      <ContrastControls contrastRef={contrastRef} onChange={onContrastChange} />
    </Stack>
  )
}

/** Two sliders for the low/high percentile cutoffs of the heatmap color scale. */
const ContrastControls = ({
  contrastRef,
  onChange,
}: {
  contrastRef: React.MutableRefObject<HeatmapContrast>
  onChange: (next: HeatmapContrast) => void
}) => (
  <Stack direction="row" spacing={3} sx={{ px: 1, alignItems: 'center' }}>
    <Stack sx={{ minWidth: 160, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Low cutoff (percentile)
      </Typography>
      <Slider
        size="small"
        defaultValue={contrastRef.current.loPct}
        min={1}
        max={95}
        step={1}
        valueLabelDisplay="auto"
        onChangeCommitted={(_, v) =>
          onChange({ ...contrastRef.current, loPct: Array.isArray(v) ? v[0]! : v })
        }
      />
    </Stack>
    <Stack sx={{ minWidth: 160, flex: 1 }}>
      <Typography variant="caption" color="text.secondary">
        High cutoff (percentile)
      </Typography>
      <Slider
        size="small"
        defaultValue={contrastRef.current.hiPct}
        min={80}
        max={100}
        step={0.5}
        valueLabelDisplay="auto"
        onChangeCommitted={(_, v) =>
          onChange({ ...contrastRef.current, hiPct: Array.isArray(v) ? v[0]! : v })
        }
      />
    </Stack>
  </Stack>
)
