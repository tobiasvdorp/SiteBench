import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Metric } from "@/components/ui/metric";
import {
  formatElapsedAxisTick,
  type TimelinePoint,
  type TimelineScatterChart,
} from "@/lib/comparison-utils";

const CHART_TICK_COLOR = "oklch(0.6 0.03 220)";
const CHART_GRID_COLOR = "oklch(0.55 0.04 220 / 15%)";
const CURSOR_COLOR = "oklch(0.78 0.14 195 / 35%)";
const DOT_RADIUS = 2.5;
const DOT_OPACITY = 0.72;
const HIT_RADIUS_PX = 6;
const HIT_CELL_SIZE = 8;
const CHART_HEIGHT = 340;
const MARGIN = { top: 8, right: 12, bottom: 28, left: 52 };

type Props = {
  chart: TimelineScatterChart;
};

type PlottedPoint = {
  x: number;
  y: number;
  runName: string;
  color: string;
  point: TimelinePoint;
};

type SpatialIndex = Map<number, PlottedPoint[]>;

function responseAxisTicks(maxResponseMs: number): number[] {
  if (maxResponseMs <= 0) return [0];
  const roughStep = maxResponseMs / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)));
  const residual = roughStep / magnitude;
  const step =
    residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const ticks: number[] = [];
  for (let value = 0; value <= maxResponseMs + step / 2; value += step) {
    ticks.push(Math.min(Math.round(value), Math.round(maxResponseMs)));
  }
  if (ticks[ticks.length - 1] !== Math.round(maxResponseMs)) {
    ticks.push(Math.round(maxResponseMs));
  }
  return ticks;
}

function cellKey(cellX: number, cellY: number): number {
  return cellX * 73856093 ^ cellY * 19349663;
}

function buildSpatialIndex(points: PlottedPoint[]): SpatialIndex {
  const index: SpatialIndex = new Map();
  for (const point of points) {
    const key = cellKey(Math.floor(point.x / HIT_CELL_SIZE), Math.floor(point.y / HIT_CELL_SIZE));
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(point);
      continue;
    }
    index.set(key, [point]);
  }
  return index;
}

function findNearestPoint(index: SpatialIndex, x: number, y: number): PlottedPoint | null {
  const hitRadiusSq = HIT_RADIUS_PX * HIT_RADIUS_PX;
  const cellX = Math.floor(x / HIT_CELL_SIZE);
  const cellY = Math.floor(y / HIT_CELL_SIZE);
  const cellRadius = Math.ceil(HIT_RADIUS_PX / HIT_CELL_SIZE);
  let nearest: PlottedPoint | null = null;
  let nearestDistSq = hitRadiusSq;

  for (let offsetY = -cellRadius; offsetY <= cellRadius; offsetY += 1) {
    for (let offsetX = -cellRadius; offsetX <= cellRadius; offsetX += 1) {
      const bucket = index.get(cellKey(cellX + offsetX, cellY + offsetY));
      if (!bucket) continue;
      for (const candidate of bucket) {
        const dx = candidate.x - x;
        const dy = candidate.y - y;
        const distSq = dx * dx + dy * dy;
        if (distSq > nearestDistSq) continue;
        nearestDistSq = distSq;
        nearest = candidate;
      }
    }
  }

  return nearest;
}

function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function TimelineScatterCanvas({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const indexRef = useRef<SpatialIndex>(new Map());
  const plotHeightRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<PlottedPoint | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    setWidth(Math.max(0, Math.floor(el.clientWidth)));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) return;

    const ctx = sizeCanvas(canvas, width, CHART_HEIGHT, dpr);
    if (!ctx) return;

    plotHeightRef.current = plotHeight;
    ctx.clearRect(0, 0, width, CHART_HEIGHT);

    const xScale = (elapsedMs: number) =>
      MARGIN.left + (elapsedMs / chart.maxElapsedMs) * plotWidth;
    const yScale = (responseMs: number) =>
      MARGIN.top + plotHeight - (responseMs / chart.maxResponseMs) * plotHeight;

    const yTicks = responseAxisTicks(chart.maxResponseMs);

    ctx.strokeStyle = CHART_GRID_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (const tick of yTicks) {
      const y = yScale(tick);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(width - MARGIN.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = CHART_GRID_COLOR;
    ctx.beginPath();
    ctx.moveTo(MARGIN.left, MARGIN.top);
    ctx.lineTo(MARGIN.left, MARGIN.top + plotHeight);
    ctx.lineTo(width - MARGIN.right, MARGIN.top + plotHeight);
    ctx.stroke();

    ctx.fillStyle = CHART_TICK_COLOR;
    ctx.font =
      '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (const tick of yTicks) {
      ctx.fillText(`${Math.round(tick)}ms`, MARGIN.left - 8, yScale(tick));
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const tick of chart.elapsedTicks) {
      const x = xScale(tick);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN.top + plotHeight);
      ctx.lineTo(x, MARGIN.top + plotHeight + 4);
      ctx.strokeStyle = CHART_GRID_COLOR;
      ctx.stroke();
      ctx.fillStyle = CHART_TICK_COLOR;
      ctx.fillText(formatElapsedAxisTick(tick), x, MARGIN.top + plotHeight + 8);
    }

    const plotted: PlottedPoint[] = [];
    ctx.globalAlpha = DOT_OPACITY;
    for (const run of chart.runs) {
      ctx.fillStyle = run.color;
      ctx.beginPath();
      for (const point of run.points) {
        const x = xScale(point.elapsedMs);
        const y = yScale(point.responseMs);
        plotted.push({ x, y, runName: run.runName, color: run.color, point });
        ctx.moveTo(x + DOT_RADIUS, y);
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    indexRef.current = buildSpatialIndex(plotted);
    setHover(null);
  }, [chart, width]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const ctx = sizeCanvas(canvas, width, CHART_HEIGHT, dpr);
    if (!ctx) return;

    ctx.clearRect(0, 0, width, CHART_HEIGHT);
    if (!hover) return;

    const plotHeight = plotHeightRef.current;
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hover.x, MARGIN.top);
    ctx.lineTo(hover.x, MARGIN.top + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(hover.x, hover.y, DOT_RADIUS + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = hover.color;
    ctx.fill();
  }, [hover, width]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setHover(findNearestPoint(indexRef.current, x, y));
    });
  };

  return (
    <div ref={containerRef} className="relative min-h-[340px] w-full">
      <canvas ref={baseCanvasRef} className="block w-full" height={CHART_HEIGHT} />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 block w-full touch-none"
        height={CHART_HEIGHT}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-sm rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground shadow-lg"
          style={{
            left: Math.min(hover.x + 12, Math.max(8, width - 280)),
            top: Math.max(8, hover.y - 12),
          }}
        >
          <p className="mb-1.5 text-sm font-medium" style={{ color: hover.color }}>
            {hover.runName}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">{hover.point.url}</p>
          <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <p>
              Response{" "}
              <Metric className="text-xs font-semibold text-popover-foreground">
                {hover.point.responseMs.toFixed(1)}
              </Metric>{" "}
              ms
            </p>
            <p>
              Elapsed{" "}
              <span className="font-mono font-semibold text-popover-foreground">
                {formatElapsedAxisTick(hover.point.elapsedMs)}
              </span>
              {" · "}
              {hover.point.resourceType}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
