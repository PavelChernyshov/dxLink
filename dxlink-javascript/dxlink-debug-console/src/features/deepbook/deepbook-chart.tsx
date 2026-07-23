import { createChart } from '@devexperts/dxcharts-lite'
import type { Chart } from '@devexperts/dxcharts-lite'
import { CanvasElement } from '@devexperts/dxcharts-lite/dist/chart/canvas/canvas-bounds-container'
import type { PartialCandle } from '@devexperts/dxcharts-lite/dist/chart/components/chart/chart.component'
import type { Drawer } from '@devexperts/dxcharts-lite/dist/chart/drawers/drawing-manager'
import Box from '@mui/material/Box'
import { useEffect, useRef } from 'react'

import type { DeepBookHeatmap, DeepBookViewModel } from './deepbook-view-model'

const HEIGHT = 420

/** Coerce the `number | 'NaN'` candle fields to a number. */
const num = (value: number | string | undefined): number =>
  typeof value === 'number' ? value : Number(value)

// Bookmap-style intensity colormap: dark blue (low resting size) → blue → light → yellow → orange → red (large).
const HEAT_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0.0, [10, 22, 60]],
  [0.2, [32, 96, 210]],
  [0.4, [150, 210, 235]],
  [0.6, [240, 220, 90]],
  [0.8, [242, 140, 40]],
  [1.0, [220, 40, 40]],
]

const heatColor = (t: number): string => {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t
  let i = 0
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i + 1]![0]) i++
  const lo = HEAT_STOPS[i]!
  const hi = HEAT_STOPS[Math.min(i + 1, HEAT_STOPS.length - 1)]!
  const span = hi[0] - lo[0]
  const f = span > 0 ? (x - lo[0]) / span : 0
  const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f)
  const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f)
  const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f)
  return `rgb(${r},${g},${b})`
}

/**
 * Custom dxcharts-lite drawer that paints the order-book liquidity heatmap on the main canvas. Each segment is a
 * horizontal band (a price level held over a time span) filled with a color whose intensity encodes the resting size,
 * positioned with the chart's live scale (`toXFromTimestamp` / `toY`) so it stays aligned with the candles on
 * pan/zoom. Registered behind the candle series and repainted on every main-canvas redraw.
 */
class HeatmapDrawer implements Drawer {
  constructor(
    private readonly chart: Chart,
    private readonly getHeatmap: () => DeepBookHeatmap | null
  ) {}

  getCanvasIds(): string[] {
    return [this.chart.mainCanvasModel.canvasId]
  }

  draw(): void {
    const heatmap = this.getHeatmap()
    if (heatmap === null || heatmap.segments.length === 0 || !Number.isFinite(heatmap.priceStep))
      return

    const ctx = this.chart.mainCanvasModel.ctx
    const bounds = this.chart.bounds.getBounds(CanvasElement.CHART)
    const left = bounds.x
    const right = bounds.x + bounds.width
    const maxSize = heatmap.maxSize

    // Band height in pixels from the domain price step, via the LIVE scale (tracks zoom).
    const rowH = Math.max(
      1.5,
      Math.abs(
        this.chart.data.toY(heatmap.minPrice) -
          this.chart.data.toY(heatmap.minPrice + heatmap.priceStep)
      )
    )

    ctx.save()
    ctx.beginPath()
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.clip()
    for (const seg of heatmap.segments) {
      let x0 = this.chart.data.toXFromTimestamp(seg.tStart)
      let x1 = this.chart.data.toXFromTimestamp(seg.tEnd)
      if (!Number.isFinite(x0) || !Number.isFinite(x1)) continue
      if (x1 < x0) {
        const tmp = x0
        x0 = x1
        x1 = tmp
      }
      if (x1 < left || x0 > right) continue // cull off-screen bands
      const y = this.chart.data.toY(seg.price)
      if (!Number.isFinite(y)) continue
      const t = maxSize > 0 ? Math.sqrt(seg.size / maxSize) : 0
      ctx.fillStyle = heatColor(t)
      ctx.fillRect(x0, y - rowH / 2, Math.max(1, x1 - x0), rowH)
    }
    ctx.restore()
  }
}

/**
 * dxcharts-lite candle chart for a DeepBook channel with the ORCS order-book liquidity heatmap overlaid underneath the
 * candles, sharing the chart's time and price axes. Candles come from the reference feed (via the VM's candle
 * listener); the heatmap is painted by a custom drawer fed by the VM's heatmap listener.
 */
export const DeepBookChart = ({ vm }: { vm: DeepBookViewModel }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const chart = createChart(container)
    const heatmapRef: { current: DeepBookHeatmap | null } = { current: null }
    const candles = new Map<string, PartialCandle>()
    let hasSnapshot = false

    const drawer = new HeatmapDrawer(chart, () => heatmapRef.current)
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
      const series = {
        candles: Array.from(candles.values()).sort((a, b) => a.timestamp - b.timestamp),
      }
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
      chart.destroy()
    }
  }, [vm])

  return (
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
  )
}
