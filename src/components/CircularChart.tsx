import { useState, useRef, useCallback, useEffect, useId } from 'react';
import type { TimeBlock } from '../types/schedule';
import {
  timeStringToMinutes,
  minutesToTimeString,
  calculateDuration,
  snapToFiveMinutes,
  formatHourTo12Hour,
  formatTo12Hour,
  formatDuration,
  validateTimeBlock,
  adjustTimeBlock,
} from '../utils/timeUtils';

type LabelOrientation = 'curved' | 'radial';

interface BlockLabelLayout {
  orientation: LabelOrientation;
  fontSize: number;
  lines: string[];
}

let measureContext: CanvasRenderingContext2D | null | undefined;

// Measure rendered text width so labels are fitted to real glyph widths, not a per-char guess
function measureTextWidth(text: string, fontSize: number, fontWeight: number, fontFamily: string): number {
  if (measureContext === undefined) {
    measureContext = typeof document !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : null;
  }
  if (!measureContext) return text.length * fontSize * 0.6;
  measureContext.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  return measureContext.measureText(text).width;
}

// Longest prefix (with ellipsis) that fits, plus how many original characters it kept
function truncateToWidth(text: string, maxWidth: number, measure: (s: string) => number): { text: string; kept: number } | null {
  if (measure(text) <= maxWidth) return { text, kept: text.length };
  for (let kept = text.length - 1; kept >= 1; kept--) {
    const candidate = `${text.slice(0, kept).trimEnd()}…`;
    if (measure(candidate) <= maxWidth) return { text: candidate, kept };
  }
  return null;
}

// Split at the word break that best balances two lines, if both lines fit
function wrapToTwoLines(text: string, maxWidth: number, measure: (s: string) => number): string[] | null {
  const words = text.split(' ');
  let best: string[] | null = null;
  let bestWidest = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const widest = Math.max(...lines.map(measure));
    if (widest <= maxWidth && widest < bestWidest) {
      best = lines;
      bestWidest = widest;
    }
  }
  return best;
}

// Arc used as a textPath. Bottom-half labels run counter-clockwise so they read upright.
function describeLabelArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, reverse: boolean): string {
  const span = Math.min(endAngle - startAngle, 359.9);
  const toPoint = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const from = toPoint(reverse ? startAngle + span : startAngle);
  const to = toPoint(reverse ? startAngle : startAngle + span);
  const largeArc = span > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${largeArc} ${reverse ? 0 : 1} ${to.x} ${to.y}`;
}

const MIN_VISIBLE_LABEL_CHARS = 4;

// Fractional minutes since midnight, so the hand moves smoothly second by second
const getCurrentMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
};

// "1:19:42", "19:42"
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// "1h 20m", "25m", "2h"
function formatShortDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// "12 PM", "9:30 AM"
function formatClockTime(totalMinutes: number): string {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h24 % 12 || 12;
  const period = h24 >= 12 ? 'PM' : 'AM';
  return m ? `${h12}:${m.toString().padStart(2, '0')} ${period}` : `${h12} ${period}`;
}

// Relative luminance (WCAG) of a hex color; null if it can't be parsed
function getLuminance(hex: string): number | null {
  const match = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(digits.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Light blocks (yellow, lime) get dark text; mid and dark tones keep white
function getBlockTextColor(blockColor: string): string {
  const luminance = getLuminance(blockColor);
  return luminance !== null && luminance > 0.55 ? '#1f2937' : '#ffffff';
}

interface CircularChartProps {
  timeBlocks: TimeBlock[];
  onBlockCreated: (startTime: string, endTime: string) => void;
  onBlockClick: (block: TimeBlock) => void;
  onBlockChanged: (block: TimeBlock) => void;
  activeBlock?: TimeBlock | null;
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  readOnly?: boolean;
  previewSize?: number;
  previewCursorTime?: string;
  // Live mode: current-time hand and a "now / next" readout in the center
  showNow?: boolean;
}

export default function CircularChart({
  timeBlocks,
  onBlockCreated,
  onBlockClick,
  onBlockChanged,
  activeBlock,
  sidebarOpen = false,
  sidebarWidth = 280,
  readOnly = false,
  previewSize,
  previewCursorTime,
  showNow = false,
}: CircularChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  useEffect(() => {
    if (!showNow) return;
    setNowMinutes(getCurrentMinutes());
    const interval = window.setInterval(() => setNowMinutes(getCurrentMinutes()), 1000);
    return () => window.clearInterval(interval);
  }, [showNow]);
  // Mouse users see resize dots only on the hovered block; touch users always see them
  const [canHover] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
  );
  const labelIdPrefix = `block-label-${useId().replace(/:/g, '')}`;
  // Labels are fitted using measured text widths, so re-fit once web fonts finish loading
  const [, setFontsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragProgress, setDragProgress] = useState(0);
  const [hasMovedEnough, setHasMovedEnough] = useState(false);
  const [hoveredBlock, setHoveredBlock] = useState<TimeBlock | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));
  const lastDragMinutesRef = useRef<number | null>(null);
  const blockDragRef = useRef<{
    block: TimeBlock;
    mode: 'move' | 'start' | 'end';
    pointerId: number;
    lastMinutes: number;
    delta: number;
    clientX: number;
    clientY: number;
    moved: boolean;
    preview: TimeBlock;
  } | null>(null);
  const [blockPreview, setBlockPreview] = useState<TimeBlock | null>(null);
  const previewValidation = blockPreview
    ? validateTimeBlock(blockPreview, timeBlocks, blockPreview.id)
    : null;

  const DRAG_THRESHOLD_MINUTES = 5;

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const defaultSize = 720;
  const isMobile = previewSize !== undefined || viewport.width < 1024;

  const baseLabelMargin = isMobile ? 24 : 35;
  const estimatedLabelMargin = baseLabelMargin;

  const mobileHeightOffset = 120; // floating pill + schedule title, no bottom nav
  const desktopHeightOffset = 120; // floating pill + schedule title
  const heightBound = viewport.height
    ? viewport.height - (isMobile ? mobileHeightOffset : desktopHeightOffset) - estimatedLabelMargin * 2
    : defaultSize;

  const sidePadding = isMobile ? 8 : 24;
  const availableWidth = viewport.width - (sidebarOpen && viewport.width >= 640 ? sidebarWidth : 0);
  const widthBound = viewport.width
    ? (availableWidth - sidePadding) / 1.17
    : defaultSize;

  const minSize = isMobile ? 280 : 380;
  const maxSize = isMobile ? 900 : 1400;
  const boundedSize = Math.min(Math.max(Math.min(heightBound, widthBound), minSize), maxSize);
  const chartSize = previewSize ?? (Number.isFinite(boundedSize) ? boundedSize : defaultSize);

  const labelMargin = Math.max(baseLabelMargin, chartSize * 0.085);
  const canvasSize = chartSize + labelMargin * 2;
  const center = canvasSize / 2;
  const radius = chartSize * 0.39;
  const innerRadius = radius * 0.62;
  const labelRadiusOffset = chartSize * 0.1;
  const tickInnerOffset = chartSize * 0.01;
  const tickOuterOffset = chartSize * 0.03;

  // Block labels scale with the chart instead of staying fixed at 10–12px
  const ringWidth = radius - innerRadius;
  const labelRadius = (radius + innerRadius) / 2;
  const labelPadding = Math.max(6, ringWidth * 0.08);
  const labelFontSize = Math.min(16, Math.max(11, chartSize * 0.02));
  const minLabelFontSize = Math.max(10, labelFontSize * 0.85);
  const labelFontFamily = typeof document !== 'undefined'
    ? getComputedStyle(document.body).fontFamily
    : 'sans-serif';

  /**
   * Pick the label orientation that fits the block best:
   * - curved along the arc for long blocks
   * - radial (pointing outward) for short blocks, where the ring's thickness gives more room
   * Full labels win over truncated ones; ties go to whichever reads closer to horizontal.
   * Labels that can't show at least a few characters are hidden (hover/list still show them).
   */
  const getBlockLabelLayout = (block: TimeBlock, startAngle: number, endAngle: number): BlockLabelLayout | null => {
    const spanRad = ((endAngle - startAngle) * Math.PI) / 180;
    const midRad = (((startAngle + endAngle) / 2) * Math.PI) / 180;

    const options: { orientation: LabelOrientation; length: number; thickness: number; horizontality: number }[] = [
      {
        orientation: 'curved',
        length: spanRad * labelRadius - labelPadding * 2,
        thickness: ringWidth - labelPadding * 2,
        horizontality: Math.abs(Math.cos(midRad)),
      },
      {
        orientation: 'radial',
        length: ringWidth - labelPadding * 2,
        // Narrowest point of a radial label is at the inner edge of the ring
        thickness: spanRad * (innerRadius + labelPadding) - 4,
        horizontality: Math.abs(Math.sin(midRad)),
      },
    ];

    let best: BlockLabelLayout | null = null;
    let bestScore = -Infinity;

    for (const option of options) {
      for (const fontSize of [labelFontSize, minLabelFontSize]) {
        if (option.thickness < fontSize * 1.15) continue;

        const measure = (s: string) => measureTextWidth(s, fontSize, 600, labelFontFamily);
        let lines: string[] | null = null;
        let kept = 0;

        const fitted = truncateToWidth(block.label, option.length, measure);
        if (fitted && fitted.kept === block.label.length) {
          lines = [fitted.text];
          kept = fitted.kept;
        } else {
          // Wrap long names onto two lines when the ring is thick enough.
          // Curved lines sit off the center radius, so budget for the shorter inner line.
          const wrapLength = option.orientation === 'curved'
            ? option.length * ((labelRadius - fontSize) / labelRadius)
            : option.length;
          const wrapped = option.thickness >= fontSize * 2.4
            ? wrapToTwoLines(block.label, wrapLength, measure)
            : null;
          if (wrapped) {
            lines = wrapped;
            kept = block.label.length;
          } else if (fitted) {
            lines = [fitted.text];
            kept = fitted.kept;
          }
        }

        if (!lines || kept < Math.min(block.label.length, MIN_VISIBLE_LABEL_CHARS)) continue;

        const isFull = kept === block.label.length;
        // Full label > bigger font > one line > more characters > closer to horizontal
        const score = (isFull ? 1e6 : 0) + fontSize * 1e4 + (lines.length === 1 ? 1e3 : 0) + kept * 10 + option.horizontality;

        if (score > bestScore) {
          best = { orientation: option.orientation, fontSize, lines };
          bestScore = score;
        }
        if (isFull) break; // no need to try a smaller font once the full label fits
      }
    }

    return best;
  };

  const angleToMinutes = (angle: number): number => {
    const normalizedAngle = ((angle % 360) + 360) % 360;
    const minutes = (normalizedAngle / 360) * (24 * 60);
    return snapToFiveMinutes(minutes);
  };

  const minutesToAngle = (minutes: number): number => {
    return (minutes / (24 * 60)) * 360;
  };

  const isPointInDraggableArea = (e: React.MouseEvent | React.TouchEvent): boolean => {
    if (!svgRef.current) return false;
    const rect = svgRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      const touch = e.touches[0];
      if (!touch) return false;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * canvasSize / rect.width - center;
    const y = (clientY - rect.top) * canvasSize / rect.height - center;
    const distance = Math.sqrt(x * x + y * y);

    return distance >= innerRadius * 0.9 && distance <= radius + 10;
  };

  const getAngleFromEvent = (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches?.[0];
      if (!touch) return 0;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * canvasSize / rect.width - center;
    const y = (clientY - rect.top) * canvasSize / rect.height - center;
    const angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    return angle;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    if (e.button !== 0 || blockDragRef.current) return;
    if (!isPointInDraggableArea(e)) return;

    const angle = getAngleFromEvent(e);
    const minutes = angleToMinutes(angle);
    setDragStart(minutes);
    setDragProgress(0);
    setHasMovedEnough(false);
    lastDragMinutesRef.current = minutes;
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (readOnly) return;
    if (!isPointInDraggableArea(e)) return;
    e.preventDefault();

    const angle = getAngleFromEvent(e);
    const minutes = angleToMinutes(angle);
    setDragStart(minutes);
    setDragProgress(0);
    setHasMovedEnough(false);
    lastDragMinutesRef.current = minutes;
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!svgRef.current || !isDragging || dragStart === null) return;

      const rect = svgRef.current.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ('touches' in e) {
        const touch = e.touches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = (clientX - rect.left) * canvasSize / rect.width - center;
      const y = (clientY - rect.top) * canvasSize / rect.height - center;
      const angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
      const minutes = angleToMinutes(angle);

      const lastMinutes = lastDragMinutesRef.current ?? minutes;
      let diff = minutes - lastMinutes;
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;

      setDragProgress((prev) => {
        const next = Math.max(0, Math.min(24 * 60, prev + diff));

        if (!hasMovedEnough && next >= DRAG_THRESHOLD_MINUTES) {
          setHasMovedEnough(true);
          if ('touches' in e) {
            e.preventDefault();
          }
        }

        if (hasMovedEnough && 'touches' in e) {
          e.preventDefault();
        }

        return next;
      });

      lastDragMinutesRef.current = minutes;
    },
    [isDragging, dragStart, center, canvasSize, hasMovedEnough, DRAG_THRESHOLD_MINUTES]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging && hasMovedEnough && dragStart !== null && dragProgress >= 5) {
      const startTime = minutesToTimeString(dragStart);
      const endTime = minutesToTimeString((dragStart + dragProgress) % (24 * 60));
      onBlockCreated(startTime, endTime);

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }

    lastDragMinutesRef.current = null;
    setIsDragging(false);
    setDragStart(null);
    setDragProgress(0);
    setHasMovedEnough(false);
  }, [isDragging, hasMovedEnough, dragStart, dragProgress, onBlockCreated]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleMouseMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleMouseMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const startBlockDrag = (event: React.PointerEvent<SVGElement>, block: TimeBlock, mode: 'move' | 'start' | 'end') => {
    if (readOnly) return;
    if (!event.isPrimary || event.button !== 0 || blockDragRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    blockDragRef.current = {
      block, mode, pointerId: event.pointerId,
      lastMinutes: angleToMinutes(getAngleFromEvent(event)),
      delta: 0, clientX: event.clientX, clientY: event.clientY,
      moved: false, preview: block,
    };
    setBlockPreview(block);
  };

  const moveBlockDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = blockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const minutes = angleToMinutes(getAngleFromEvent(event));
    let difference = minutes - drag.lastMinutes;
    if (difference > 720) difference -= 1440;
    if (difference < -720) difference += 1440;
    drag.lastMinutes = minutes;
    drag.delta += difference;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4) drag.moved = true;
    if (!drag.moved) return;

    drag.preview = adjustTimeBlock(drag.block, drag.mode, drag.delta);
    setBlockPreview(drag.preview);
  };

  const finishBlockDrag = (event: React.PointerEvent<SVGSVGElement>, cancelled = false) => {
    const drag = blockDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    blockDragRef.current = null;
    setBlockPreview(null);
    setHoveredBlock(null);
    if (cancelled) return;
    if (!drag.moved) {
      onBlockClick(drag.block);
    } else if (validateTimeBlock(drag.preview, timeBlocks, drag.block.id).valid) {
      onBlockChanged(drag.preview);
    }
  };

  const renderHourLabels = () => {
    const labels = [];
    const hoursToShow = isMobile ? [0, 6, 12, 18] : [0, 3, 6, 9, 12, 15, 18, 21];

    for (const hour of hoursToShow) {
      const angle = (hour / 24) * 360;
      const angleRad = ((angle - 90) * Math.PI) / 180;
      const labelRadius = radius + labelRadiusOffset;
      const x = center + labelRadius * Math.cos(angleRad);
      const y = center + labelRadius * Math.sin(angleRad);

      labels.push(
        <text
          key={`hour-${hour}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-muted)"
          fontSize={isMobile ? 10 : 11}
          fontWeight="500"
        >
          {formatHourTo12Hour(hour)}
        </text>
      );
    }

    return labels;
  };

  const renderHourTicks = () => {
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * 360;
      const angleRad = ((angle - 90) * Math.PI) / 180;
      // Every third hour (the labelled ones) gets a slightly longer, stronger tick
      const isMajor = i % 3 === 0;
      const outerOffset = isMajor ? tickOuterOffset : tickInnerOffset + (tickOuterOffset - tickInnerOffset) * 0.6;
      const x1 = center + (radius + tickInnerOffset) * Math.cos(angleRad);
      const y1 = center + (radius + tickInnerOffset) * Math.sin(angleRad);
      const x2 = center + (radius + outerOffset) * Math.cos(angleRad);
      const y2 = center + (radius + outerOffset) * Math.sin(angleRad);

      ticks.push(
        <line
          key={`tick-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--chart-tick)"
          strokeWidth={isMajor ? 1.5 : 1}
          strokeLinecap="round"
          opacity={isMajor ? 0.9 : 0.55}
        />
      );
    }
    return ticks;
  };

  const renderHourSegments = () => {
    const segments = [];
    for (let hour = 0; hour < 24; hour++) {
      const startAngle = (hour / 24) * 360;
      const endAngle = ((hour + 1) / 24) * 360;
      const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
      const endAngleRad = ((endAngle - 90) * Math.PI) / 180;

      const x1 = center + innerRadius * Math.cos(startAngleRad);
      const y1 = center + innerRadius * Math.sin(startAngleRad);
      const x2 = center + radius * Math.cos(startAngleRad);
      const y2 = center + radius * Math.sin(startAngleRad);
      const x3 = center + radius * Math.cos(endAngleRad);
      const y3 = center + radius * Math.sin(endAngleRad);
      const x4 = center + innerRadius * Math.cos(endAngleRad);
      const y4 = center + innerRadius * Math.sin(endAngleRad);

      const path = `
        M ${x1} ${y1}
        L ${x2} ${y2}
        A ${radius} ${radius} 0 0 1 ${x3} ${y3}
        L ${x4} ${y4}
        A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1}
        Z
      `;

      segments.push(
        <path
          key={`segment-${hour}`}
          d={path}
          fill="var(--chart-segment)"
          stroke="none"
        />
      );
    }
    return segments;
  };

  const renderHourDividers = () => {
    const dividers = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * 360;
      const angleRad = ((angle - 90) * Math.PI) / 180;
      const x1 = center + innerRadius * Math.cos(angleRad);
      const y1 = center + innerRadius * Math.sin(angleRad);
      const x2 = center + radius * Math.cos(angleRad);
      const y2 = center + radius * Math.sin(angleRad);

      dividers.push(
        <line
          key={`divider-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--chart-divider)"
          strokeWidth="1.5"
        />
      );
    }
    return dividers;
  };

  const renderBlockLabel = (
    blockId: string,
    layout: BlockLabelLayout,
    startAngle: number,
    endAngle: number,
    textColor: string,
  ) => {
    const { orientation, fontSize, lines } = layout;

    // Center the stack of name lines on the label radius
    const lineHeight = fontSize * 1.15;
    const placedLines = lines.map((text, i) => ({
      text,
      dy: (i - (lines.length - 1) / 2) * lineHeight + fontSize * 0.35,
    }));

    const midAngle = (startAngle + endAngle) / 2;

    if (orientation === 'curved') {
      const pathId = `${labelIdPrefix}-${blockId}`;
      const isBottomHalf = midAngle > 90 && midAngle < 270;
      return (
        <g pointerEvents="none">
          <path id={pathId} d={describeLabelArc(center, center, labelRadius, startAngle, endAngle, isBottomHalf)} fill="none" />
          {placedLines.map((line, i) => (
            <text key={i} dy={line.dy} fill={textColor} fontWeight="600" style={{ fontSize: `${fontSize}px` }}>
              <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">{line.text}</textPath>
            </text>
          ))}
        </g>
      );
    }

    // Radial: right half reads outward from the center, left half reads inward
    const midAngleRad = ((midAngle - 90) * Math.PI) / 180;
    const x = center + labelRadius * Math.cos(midAngleRad);
    const y = center + labelRadius * Math.sin(midAngleRad);
    const rotation = midAngle < 180 ? midAngle - 90 : midAngle + 90;

    return (
      <g pointerEvents="none" transform={`rotate(${rotation}, ${x}, ${y})`}>
        {placedLines.map((line, i) => (
          <text key={i} x={x} y={y} dy={line.dy} textAnchor="middle" fill={textColor} fontWeight="600" style={{ fontSize: `${fontSize}px` }}>
            {line.text}
          </text>
        ))}
      </g>
    );
  };

  /**
   * Blocks too thin for an in-ring label get a callout just inside the ring, in the empty
   * center: a dot in the block's color at its inner edge, with the name running inward.
   * Neighbouring callouts are nudged apart; ones that would drift too far are dropped
   * (hover and the list still show them).
   */
  const renderInnerCallouts = () => {
    const calloutFontSize = Math.max(10, labelFontSize * 0.8);
    const dotRadius = innerRadius - Math.max(6, ringWidth * 0.06);
    const textRadius = dotRadius - calloutFontSize * 0.8;
    // Keep clear of the center readout
    const maxLength = innerRadius * 0.38;
    const minSeparation = (calloutFontSize * 1.3) / (textRadius - maxLength / 2);
    const maxShift = minSeparation * 2.5;

    const candidates = timeBlocks
      .map((originalBlock) => {
        const block = blockPreview?.id === originalBlock.id ? blockPreview : originalBlock;
        const startAngle = minutesToAngle(timeStringToMinutes(block.startTime));
        const endAngle = startAngle + minutesToAngle(calculateDuration(block.startTime, block.endTime));
        if (getBlockLabelLayout(block, startAngle, endAngle)) return null;
        const fitted = truncateToWidth(block.label, maxLength, (s) => measureTextWidth(s, calloutFontSize, 500, labelFontFamily));
        if (!fitted || fitted.kept < Math.min(block.label.length, MIN_VISIBLE_LABEL_CHARS)) return null;
        return { originalBlock, block, text: fitted.text, midRad: (((startAngle + endAngle) / 2) * Math.PI) / 180 };
      })
      .filter((c) => c !== null)
      .sort((a, b) => a.midRad - b.midRad);

    let previousRad = -Infinity;
    const placed = candidates.flatMap((candidate) => {
      const labelRad = Math.max(candidate.midRad, previousRad + minSeparation);
      if (labelRad - candidate.midRad > maxShift) return [];
      previousRad = labelRad;
      return [{ ...candidate, labelRad }];
    });

    const centerBusy = !!(blockPreview || activeBlock || hoveredBlock || (isDragging && hasMovedEnough));

    return placed.map(({ originalBlock, block, text, midRad, labelRad }) => {
      const dotAngle = midRad - Math.PI / 2;
      const labelAngle = labelRad - Math.PI / 2;
      const x = center + textRadius * Math.cos(labelAngle);
      const y = center + textRadius * Math.sin(labelAngle);
      const labelDeg = (labelRad * 180) / Math.PI;
      // Same reading rule as radial labels: right half reads outward, left half inward
      const isRightHalf = labelDeg < 180;
      const rotation = isRightHalf ? labelDeg - 90 : labelDeg + 90;
      const isFocused = hoveredBlock?.id === block.id || activeBlock?.id === block.id;

      return (
        <g
          key={`callout-${block.id}`}
          opacity={centerBusy && !isFocused ? 0.25 : 1}
          className="transition-opacity"
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
          onClick={() => !readOnly && onBlockClick(originalBlock)}
          onMouseEnter={() => setHoveredBlock(block)}
          onMouseLeave={() => setHoveredBlock(null)}
        >
          <circle
            cx={center + dotRadius * Math.cos(dotAngle)}
            cy={center + dotRadius * Math.sin(dotAngle)}
            r={Math.max(3, calloutFontSize * 0.28)}
            fill={block.color}
          />
          <text
            x={x}
            y={y}
            dy={calloutFontSize * 0.35}
            textAnchor={isRightHalf ? 'end' : 'start'}
            transform={`rotate(${rotation}, ${x}, ${y})`}
            fill="var(--chart-label)"
            fontWeight="500"
            style={{ fontSize: `${calloutFontSize}px` }}
          >
            {text}
          </text>
        </g>
      );
    });
  };

  const ringSegmentPath = (startAngle: number, endAngle: number) => {
    const span = Math.min(endAngle - startAngle, 359.99);
    const a0 = ((startAngle - 90) * Math.PI) / 180;
    const a1 = ((startAngle + span - 90) * Math.PI) / 180;
    const largeArc = span > 180 ? 1 : 0;
    return `M ${center + innerRadius * Math.cos(a0)} ${center + innerRadius * Math.sin(a0)}
      L ${center + radius * Math.cos(a0)} ${center + radius * Math.sin(a0)}
      A ${radius} ${radius} 0 ${largeArc} 1 ${center + radius * Math.cos(a1)} ${center + radius * Math.sin(a1)}
      L ${center + innerRadius * Math.cos(a1)} ${center + innerRadius * Math.sin(a1)}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${center + innerRadius * Math.cos(a0)} ${center + innerRadius * Math.sin(a0)} Z`;
  };

  /**
   * Live mode: wash out time that has already passed. Finished blocks fade completely,
   * the current block fades from its start up to the hand, upcoming blocks stay vivid.
   */
  const getElapsedWash = (block: TimeBlock, startAngle: number) => {
    if (!showNow) return null;
    const start = timeStringToMinutes(block.startTime);
    const duration = calculateDuration(block.startTime, block.endTime);
    const elapsed = (nowMinutes - start + 1440) % 1440;
    if (elapsed < duration) {
      return { path: ringSegmentPath(startAngle, startAngle + minutesToAngle(elapsed)), isPast: false };
    }
    const isPast = start + duration <= 1440 && start + duration <= nowMinutes;
    return isPast ? { path: ringSegmentPath(startAngle, startAngle + minutesToAngle(duration)), isPast: true } : null;
  };

  const renderNowHand = () => {
    if (!showNow) return null;
    const angleRad = ((minutesToAngle(nowMinutes) - 90) * Math.PI) / 180;
    const from = innerRadius - 6;
    const to = radius + tickOuterOffset;
    return (
      <g pointerEvents="none" aria-hidden="true">
        <line
          x1={center + from * Math.cos(angleRad)}
          y1={center + from * Math.sin(angleRad)}
          x2={center + to * Math.cos(angleRad)}
          y2={center + to * Math.sin(angleRad)}
          stroke="#ef4444"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Expanding ring behind the tip reads as "live"; disabled for reduced motion */}
        <circle
          cx={center + to * Math.cos(angleRad)}
          cy={center + to * Math.sin(angleRad)}
          r="3.5"
          fill="#ef4444"
          className="animate-ping motion-reduce:hidden"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
        <circle cx={center + to * Math.cos(angleRad)} cy={center + to * Math.sin(angleRad)} r="3.5" fill="#ef4444" />
      </g>
    );
  };

  const renderTimeBlocks = () => {
    return timeBlocks.map((originalBlock) => {
      const block = blockPreview?.id === originalBlock.id ? blockPreview : originalBlock;
      const startMinutes = timeStringToMinutes(block.startTime);
      const duration = calculateDuration(block.startTime, block.endTime);

      const startAngle = minutesToAngle(startMinutes);
      const endAngle = minutesToAngle(startMinutes + duration);

      const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
      const endAngleRad = ((endAngle - 90) * Math.PI) / 180;

      const largeArc = endAngle - startAngle > 180 ? 1 : 0;

      const x1 = center + innerRadius * Math.cos(startAngleRad);
      const y1 = center + innerRadius * Math.sin(startAngleRad);
      const x2 = center + radius * Math.cos(startAngleRad);
      const y2 = center + radius * Math.sin(startAngleRad);
      const x3 = center + radius * Math.cos(endAngleRad);
      const y3 = center + radius * Math.sin(endAngleRad);
      const x4 = center + innerRadius * Math.cos(endAngleRad);
      const y4 = center + innerRadius * Math.sin(endAngleRad);

      const path = `
        M ${x1} ${y1}
        L ${x2} ${y2}
        A ${radius} ${radius} 0 ${largeArc} 1 ${x3} ${y3}
        L ${x4} ${y4}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1}
        Z
      `;

      const labelLayout = getBlockLabelLayout(block, startAngle, endAngle);
      const elapsedWash = getElapsedWash(block, startAngle);

      const textColor = getBlockTextColor(block.color);
      const isHovered = hoveredBlock?.id === block.id || activeBlock?.id === block.id;
      const showHandles = !canHover || isHovered || blockPreview?.id === block.id;

      return (
        // Hover lives on the group so moving from the block onto its handles keeps them visible
        <g key={block.id} onMouseEnter={() => setHoveredBlock(block)} onMouseLeave={() => setHoveredBlock(null)}>
          <path
            d={path}
            fill={block.color}
            stroke={blockPreview?.id === block.id && !previewValidation?.valid ? '#ef4444' : 'var(--chart-segment)'}
            strokeWidth="2"
            className={readOnly ? 'transition-opacity' : 'cursor-grab active:cursor-grabbing transition-opacity'}
            opacity={isHovered ? 0.85 : 1}
            role={readOnly ? undefined : 'button'}
            tabIndex={readOnly ? undefined : 0}
            aria-label={`${readOnly ? '' : 'Edit '}${block.label}, ${formatTo12Hour(block.startTime)} to ${formatTo12Hour(block.endTime)}`}
            onKeyDown={(event) => {
              if (readOnly) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onBlockClick(originalBlock);
              }
            }}
            onPointerDown={(event) => startBlockDrag(event, originalBlock, 'move')}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
          />
          {elapsedWash && (
            <path d={elapsedWash.path} fill="var(--page-bg)" opacity={0.5} pointerEvents="none" />
          )}
          {labelLayout && (
            <g opacity={elapsedWash?.isPast ? 0.75 : 1}>
              {renderBlockLabel(
                block.id,
                labelLayout,
                startAngle,
                endAngle,
                // A washed-out light block turns dark in dark mode, so its dark text switches to the theme color
                elapsedWash?.isPast && textColor !== '#ffffff' ? 'var(--text-primary)' : textColor,
              )}
            </g>
          )}
          {!readOnly && (['start', 'end'] as const).map((edge) => {
            const edgeAngle = edge === 'start' ? startAngleRad : endAngleRad;
            const handleRadius = edge === 'start'
              ? innerRadius + (radius - innerRadius) * 0.25
              : innerRadius + (radius - innerRadius) * 0.75;
            return (
              <g key={edge}
                onPointerDown={(event) => startBlockDrag(event, originalBlock, edge)}
                onMouseDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
                style={{ cursor: 'ew-resize' }}>
                <title>{`Drag to change ${block.label} ${edge} time`}</title>
                <circle cx={center + handleRadius * Math.cos(edgeAngle)} cy={center + handleRadius * Math.sin(edgeAngle)}
                  r={isMobile ? 13 : 10} fill="transparent" />
                <circle cx={center + handleRadius * Math.cos(edgeAngle)} cy={center + handleRadius * Math.sin(edgeAngle)}
                  r={isMobile ? 4 : 3} fill="white" stroke={block.color} strokeWidth="1.5" pointerEvents="none"
                  opacity={showHandles ? 1 : 0} style={{ transition: 'opacity 120ms ease' }} />
              </g>
            );
          })}
        </g>
      );
    });
  };

  const renderDragPreview = () => {
    if (!isDragging || !hasMovedEnough || dragStart === null || dragProgress < 5) return null;

    const startMinutes = dragStart;
    const duration = dragProgress;
    const endMinutesAbsolute = dragStart + duration;

    const startAngle = minutesToAngle(startMinutes);
    const endAngle = minutesToAngle(endMinutesAbsolute);

    const startAngleRad = ((startAngle - 90) * Math.PI) / 180;
    const endAngleRad = ((endAngle - 90) * Math.PI) / 180;

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    const x1 = center + innerRadius * Math.cos(startAngleRad);
    const y1 = center + innerRadius * Math.sin(startAngleRad);
    const x2 = center + radius * Math.cos(startAngleRad);
    const y2 = center + radius * Math.sin(startAngleRad);
    const x3 = center + radius * Math.cos(endAngleRad);
    const y3 = center + radius * Math.sin(endAngleRad);
    const x4 = center + innerRadius * Math.cos(endAngleRad);
    const y4 = center + innerRadius * Math.sin(endAngleRad);

    const path = `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${radius} ${radius} 0 ${largeArc} 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1} ${y1}
      Z
    `;

    return (
      <g className="pointer-events-none">
        <defs>
          <linearGradient id="dragGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#DBEAFE" />
            <stop offset="100%" stopColor="#E9D5FF" />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="url(#dragGradient)"
          opacity="0.7"
          stroke="#9CA3AF"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      </g>
    );
  };

  // Center display: drag state > activeBlock/hoveredBlock > resting total > empty
  const renderCenterDisplay = () => {
    const totalScheduledMinutes = timeBlocks.reduce(
      (sum, b) => sum + calculateDuration(b.startTime, b.endTime),
      0
    );

    const formatTotalTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    };

    // Drag in progress
    if (isDragging && hasMovedEnough && dragStart !== null && dragProgress >= 5) {
      const startLabel = formatTo12Hour(minutesToTimeString(dragStart));
      const endLabel = formatTo12Hour(
        minutesToTimeString((dragStart + dragProgress) % (24 * 60))
      );
      const durationLabel = formatDuration(dragProgress);
      const timeFontSize = isMobile ? 12 : 14;
      const durationFontSize = isMobile ? 10 : 11;
      return (
        <g pointerEvents="none">
          <text
            x={center}
            y={center - 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#93c5fd"
            fontWeight="600"
            fontSize={timeFontSize}
          >
            {startLabel} → {endLabel}
          </text>
          <text
            x={center}
            y={center + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-tick)"
            fontSize={durationFontSize}
          >
            {durationLabel}
          </text>
        </g>
      );
    }

    // Hovered/active block (segment hover or list hover)
    const displayBlock = blockPreview ?? activeBlock ?? hoveredBlock;
    if (displayBlock) {
      const duration = calculateDuration(displayBlock.startTime, displayBlock.endTime);
      const nameFontSize = isMobile ? 13 : 15;
      const detailFontSize = isMobile ? 10 : 11;
      return (
        <g pointerEvents="none">
          <text
            x={center}
            y={center - 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-label)"
            fontWeight="600"
            fontSize={nameFontSize}
          >
            {displayBlock.label}
          </text>
          <text
            x={center}
            y={center + 3}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-tick)"
            fontSize={detailFontSize}
          >
            {formatTo12Hour(displayBlock.startTime)} – {formatTo12Hour(displayBlock.endTime)}
          </text>
          <text
            x={center}
            y={center + 17}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-tick)"
            fontSize={detailFontSize}
            opacity="0.7"
          >
            {formatDuration(duration)}
          </text>
          {blockPreview && !previewValidation?.valid && (
            <text x={center} y={center + 36} textAnchor="middle" fill="#ef4444" fontSize={isMobile ? 9 : 11}>
              Overlaps another block. Move it to a free time.
            </text>
          )}
        </g>
      );
    }

    // Live mode at rest: what's happening now, or what's next
    if (showNow && timeBlocks.length > 0) {
      let current: { block: TimeBlock; secondsLeft: number; endMinutes: number } | null = null;
      let next: { block: TimeBlock; minutesUntil: number } | null = null;

      for (const block of timeBlocks) {
        const start = timeStringToMinutes(block.startTime);
        const duration = calculateDuration(block.startTime, block.endTime);
        const elapsed = (nowMinutes - start + 1440) % 1440;
        if (elapsed < duration) {
          current = { block, secondsLeft: Math.ceil((duration - elapsed) * 60), endMinutes: start + duration };
        }
        const minutesUntil = (start - nowMinutes + 1440) % 1440;
        if (minutesUntil > 0 && (!next || minutesUntil < next.minutesUntil)) {
          next = { block, minutesUntil };
        }
      }

      const lines = current
        ? [current.block.label, `${formatCountdown(current.secondsLeft)} left`, `until ${formatClockTime(current.endMinutes)}`]
        : ['Free now', next ? `Next: ${next.block.label}` : '', next ? `in ${formatShortDuration(Math.ceil(next.minutesUntil))}` : ''];
      const nameFontSize = isMobile ? 14 : 16;
      const detailFontSize = isMobile ? 10 : 12;

      return (
        <g pointerEvents="none">
          <text x={center} y={center - 16} textAnchor="middle" dominantBaseline="middle" fill="var(--chart-label)" fontWeight="600" fontSize={nameFontSize}>
            {lines[0]}
          </text>
          <text x={center} y={center + 4} textAnchor="middle" dominantBaseline="middle" fill="var(--chart-label)" fontSize={detailFontSize} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {lines[1]}
          </text>
          <text x={center} y={center + 20} textAnchor="middle" dominantBaseline="middle" fill="var(--chart-tick)" fontSize={detailFontSize}>
            {lines[2]}
          </text>
        </g>
      );
    }

    // Resting: total scheduled time
    if (totalScheduledMinutes > 0) {
      const bigFontSize = isMobile ? 20 : 26;
      const smallFontSize = isMobile ? 10 : 12;
      return (
        <g pointerEvents="none">
          <text
            x={center}
            y={center - 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-label)"
            fontWeight="700"
            fontSize={bigFontSize}
          >
            {formatTotalTime(totalScheduledMinutes)}
          </text>
          <text
            x={center}
            y={center + bigFontSize * 0.65}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chart-tick)"
            fontSize={smallFontSize}
            opacity="0.7"
          >
            scheduled today
          </text>
        </g>
      );
    }

    return null;
  };

  return (
    <div className="relative flex-1 flex items-center justify-center overflow-hidden select-none">
      <svg
        ref={svgRef}
        width={canvasSize}
        height={canvasSize}
        viewBox={`0 0 ${canvasSize} ${canvasSize}`}
        className={readOnly ? 'block' : 'cursor-crosshair block'}
        style={{
          maxWidth: '100%',
          height: 'auto',
          maxHeight: '100vh',
          margin: '0 auto',
          touchAction: readOnly ? 'auto' : 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onPointerMove={moveBlockDrag}
        onPointerUp={(event) => finishBlockDrag(event)}
        onPointerCancel={(event) => finishBlockDrag(event, true)}
        onLostPointerCapture={(event) => finishBlockDrag(event, true)}
      >
        {/* Background circles */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--chart-ring)"
          strokeWidth="2"
        />
        <circle
          cx={center}
          cy={center}
          r={innerRadius}
          fill="none"
          stroke="var(--chart-inner-ring)"
          strokeWidth="2"
        />

        {renderHourSegments()}
        {renderHourDividers()}
        {renderHourTicks()}
        {renderTimeBlocks()}
        {renderInnerCallouts()}
        {renderNowHand()}
        {previewCursorTime && (() => {
          const angle = (timeStringToMinutes(previewCursorTime) / (24 * 60)) * 2 * Math.PI - Math.PI / 2;
          const cursorRadius = (radius + innerRadius) / 2;
          return (
            <circle
              cx={center + cursorRadius * Math.cos(angle)}
              cy={center + cursorRadius * Math.sin(angle)}
              r="6"
              fill="#fff"
              stroke="#64748b"
              strokeWidth="2"
              pointerEvents="none"
            />
          );
        })()}
        {renderDragPreview()}
        {renderHourLabels()}

        {/* Empty state affordance */}
        {timeBlocks.length === 0 && !isDragging && (
          <g>
            <text
              x={center}
              y={center - 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--chart-label)"
              fontSize={isMobile ? '13' : '15'}
              fontWeight="500"
              opacity="0.7"
            >
              {isMobile ? 'Drag on ring' : 'Click & drag on the ring'}
            </text>
            <text
              x={center}
              y={center + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--chart-tick)"
              fontSize={isMobile ? '11' : '12'}
              opacity="0.6"
            >
              to add time blocks
            </text>
          </g>
        )}

        {renderCenterDisplay()}
      </svg>
      {!readOnly && timeBlocks.length > 0 && (
        <p className="absolute bottom-2 inset-x-2 text-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
          Drag blocks to move · Drag dots to resize<br />
          Click or tap a block to edit its times
        </p>
      )}
    </div>
  );
}
