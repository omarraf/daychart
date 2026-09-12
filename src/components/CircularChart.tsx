import { useState, useRef, useCallback, useEffect } from 'react';
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

interface CircularChartProps {
  timeBlocks: TimeBlock[];
  onBlockCreated: (startTime: string, endTime: string) => void;
  onBlockClick: (block: TimeBlock) => void;
  onBlockChanged: (block: TimeBlock) => void;
  activeBlock?: TimeBlock | null;
}

export default function CircularChart({
  timeBlocks,
  onBlockCreated,
  onBlockClick,
  onBlockChanged,
  activeBlock,
}: CircularChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
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
  const isMobile = viewport.width < 1024;

  const baseLabelMargin = isMobile ? 24 : 35;
  const estimatedLabelMargin = baseLabelMargin;

  const mobileHeightOffset = 80; // floating pill only, no top toolbar or bottom nav
  const desktopHeightOffset = 80; // floating pill only
  const heightBound = viewport.height
    ? viewport.height - (isMobile ? mobileHeightOffset : desktopHeightOffset) - estimatedLabelMargin * 2
    : defaultSize;

  const sidePadding = isMobile ? 8 : 24;
  const widthBound = viewport.width
    ? viewport.width - sidePadding - estimatedLabelMargin * 2
    : defaultSize;

  const minSize = isMobile ? 280 : 380;
  const maxSize = isMobile ? 900 : 1400;
  const boundedSize = Math.min(Math.max(Math.min(heightBound, widthBound), minSize), maxSize);
  const chartSize = Number.isFinite(boundedSize) ? boundedSize : defaultSize;

  const labelMargin = Math.max(baseLabelMargin, chartSize * 0.085);
  const canvasSize = chartSize + labelMargin * 2;
  const center = canvasSize / 2;
  const radius = chartSize * 0.39;
  const innerRadius = radius * 0.62;
  const labelRadiusOffset = chartSize * 0.1;
  const tickInnerOffset = chartSize * 0.01;
  const tickOuterOffset = chartSize * 0.03;

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
          fill="var(--chart-label)"
          fontSize="12"
          fontWeight="600"
        >
          {formatHourTo12Hour(hour)}
        </text>
      );
    }

    return labels;
  };

  const getTextColor = (): string => {
    return '#ffffff';
  };

  const renderHourTicks = () => {
    const ticks = [];
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * 360;
      const angleRad = ((angle - 90) * Math.PI) / 180;
      const x1 = center + (radius + tickInnerOffset) * Math.cos(angleRad);
      const y1 = center + (radius + tickInnerOffset) * Math.sin(angleRad);
      const x2 = center + (radius + tickOuterOffset) * Math.cos(angleRad);
      const y2 = center + (radius + tickOuterOffset) * Math.sin(angleRad);

      ticks.push(
        <line
          key={`tick-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--chart-tick)"
          strokeWidth="2"
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

      const midAngle = (startAngle + endAngle) / 2;
      const midAngleRad = ((midAngle - 90) * Math.PI) / 180;
      const labelRadius = (radius + innerRadius) / 2;
      const labelX = center + labelRadius * Math.cos(midAngleRad);
      const labelY = center + labelRadius * Math.sin(midAngleRad);

      const arcSpanDeg = endAngle - startAngle;
      const arcLength = (arcSpanDeg / 360) * 2 * Math.PI * labelRadius;
      const radialWidth = radius - innerRadius;

      const charWidthLarge = 7;
      const charWidthSmall = 5.5;
      const availableWidth = Math.min(arcLength * 0.85, radialWidth * 1.2);

      let fontSize: number;
      let displayLabel: string;

      if (duration < 20) {
        fontSize = 0;
        displayLabel = '';
      } else if (availableWidth < charWidthSmall * 2) {
        fontSize = 0;
        displayLabel = '';
      } else if (availableWidth < charWidthLarge * block.label.length) {
        fontSize = 10;
        const maxChars = Math.floor(availableWidth / charWidthSmall);
        if (maxChars < 3) {
          fontSize = 0;
          displayLabel = '';
        } else if (maxChars < block.label.length) {
          displayLabel = block.label.slice(0, maxChars - 1) + '\u2026';
        } else {
          displayLabel = block.label;
        }
      } else {
        fontSize = 12;
        displayLabel = block.label;
      }

      const rotationAngle = midAngle;
      const adjustedRotation =
        rotationAngle > 90 && rotationAngle < 270 ? rotationAngle + 180 : rotationAngle;

      const textColor = getTextColor();
      const isHovered = hoveredBlock?.id === block.id || activeBlock?.id === block.id;

      return (
        <g key={block.id}>
          <path
            d={path}
            fill={block.color}
            stroke={blockPreview?.id === block.id && !previewValidation?.valid ? '#ef4444' : 'var(--chart-segment)'}
            strokeWidth="2"
            className="cursor-grab active:cursor-grabbing transition-opacity"
            opacity={isHovered ? 0.85 : 1}
            role="button"
            tabIndex={0}
            aria-label={`Edit ${block.label}, ${formatTo12Hour(block.startTime)} to ${formatTo12Hour(block.endTime)}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onBlockClick(originalBlock);
              }
            }}
            onPointerDown={(event) => startBlockDrag(event, originalBlock, 'move')}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onMouseEnter={() => setHoveredBlock(block)}
            onMouseLeave={() => setHoveredBlock(null)}
          />
          {fontSize > 0 && displayLabel && (
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${adjustedRotation}, ${labelX}, ${labelY})`}
              fill={textColor}
              fontWeight="600"
              pointerEvents="none"
              style={{ fontSize: `${fontSize}px` }}
            >
              {displayLabel}
            </text>
          )}
          {(['start', 'end'] as const).map((edge) => {
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
                  r={isMobile ? 4 : 3} fill="white" stroke={block.color} strokeWidth="1.5" pointerEvents="none" />
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
              Overlaps another block — move to a free time
            </text>
          )}
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
        className="cursor-crosshair block"
        style={{
          maxWidth: '100%',
          height: 'auto',
          maxHeight: '100vh',
          margin: '0 auto',
          touchAction: 'none',
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
      {timeBlocks.length > 0 && (
        <p className="absolute bottom-2 inset-x-2 text-center text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 pointer-events-none">
          Drag blocks to move · Drag dots to resize<br />
          Click or tap a block to edit its times
        </p>
      )}
    </div>
  );
}
