import { useRef, useState, useEffect, useCallback } from 'react';
import type { TimeBlock } from '../types/schedule';
import {
  minutesToTimeString,
  timeStringToMinutes,
  calculateDuration,
  formatDuration,
  snapToFiveMinutes,
  sortTimeBlocks,
  formatHourTo12Hour,
  formatTo12Hour,
} from '../utils/timeUtils';

interface TimelineProps {
  timeBlocks: TimeBlock[];
  onBlockCreated: (startTime: string, endTime: string) => void;
  onBlockClick: (block: TimeBlock) => void;
  readOnly?: boolean;
  preview?: boolean;
  previewFocusTime?: string;
}

export default function Timeline({
  timeBlocks,
  onBlockCreated,
  onBlockClick,
  readOnly = false,
  preview = false,
  previewFocusTime,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [dragStartPixel, setDragStartPixel] = useState<number | null>(null);
  const [hasMovedEnough, setHasMovedEnough] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 0,
  );
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 1024
  );

  const DRAG_THRESHOLD = 10; // pixels to move before starting drag

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Use viewport height minus top bar and padding — same approach on mobile and desktop
  const timelineHeight = preview ? 960 : viewportHeight
    ? Math.max(1200, (viewportHeight - (isMobile ? 80 : 320)) * 2)
    : 1600;
  const totalDayMinutes = 24 * 60;

  useEffect(() => {
    if (!preview || !previewFocusTime || !scrollRef.current) return;
    const top = timeStringToMinutes(previewFocusTime) / totalDayMinutes * timelineHeight;
    scrollRef.current.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' });
  }, [preview, previewFocusTime, timelineHeight, totalDayMinutes]);

  const getTimelineSegments = (startMinutes: number, durationMinutes: number) => {
    if (durationMinutes <= 0) return [];

    if (startMinutes + durationMinutes <= totalDayMinutes) {
      return [{
        start: startMinutes,
        duration: durationMinutes,
      }];
    }

    const firstDuration = totalDayMinutes - startMinutes;
    const secondDuration = durationMinutes - firstDuration;

    const segments = [
      { start: startMinutes, duration: firstDuration },
      { start: 0, duration: secondDuration },
    ];

    return segments.filter(segment => segment.duration > 0);
  };

  // Convert pixel position to time in minutes
  const pixelToMinutes = (pixelY: number): number => {
    if (!timelineRef.current) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeY = pixelY - rect.top;
    const percentage = relativeY / rect.height;
    const minutes = Math.max(0, Math.min(1439, percentage * (24 * 60)));
    return snapToFiveMinutes(minutes);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    // Stop the browser from starting a text selection that sweeps the hour labels while dragging
    e.preventDefault();
    const minutes = pixelToMinutes(e.clientY);
    setDragStart(minutes);
    setDragEnd(minutes);
    setDragStartPixel(e.clientY);
    setHasMovedEnough(false);
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (readOnly) return;
    // Don't prevent default initially - allow scrolling until threshold is met
    const touch = e.touches[0];
    const minutes = pixelToMinutes(touch.clientY);
    setDragStart(minutes);
    setDragEnd(minutes);
    setDragStartPixel(touch.clientY);
    setHasMovedEnough(false);
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!timelineRef.current || !isDragging) return;

    // Check if we've moved enough to start dragging
    if (!hasMovedEnough && dragStartPixel !== null) {
      const distance = Math.abs(e.clientY - dragStartPixel);
      if (distance < DRAG_THRESHOLD) {
        return; // Not moved enough yet
      }
      setHasMovedEnough(true);
    }

    const minutes = pixelToMinutes(e.clientY);
    setDragEnd(minutes);
  }, [isDragging, hasMovedEnough, dragStartPixel, DRAG_THRESHOLD]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!timelineRef.current || !isDragging) return;

    const touch = e.touches[0];

    // Check if we've moved enough to start dragging
    if (!hasMovedEnough && dragStartPixel !== null) {
      const distance = Math.abs(touch.clientY - dragStartPixel);
      if (distance < DRAG_THRESHOLD) {
        return; // Not moved enough yet - allow normal scrolling
      }
      setHasMovedEnough(true);
      e.preventDefault(); // Now prevent scrolling since we're dragging
    }

    if (hasMovedEnough) {
      e.preventDefault(); // Prevent scrolling while dragging
    }

    const minutes = pixelToMinutes(touch.clientY);
    setDragEnd(minutes);
  }, [isDragging, hasMovedEnough, dragStartPixel, DRAG_THRESHOLD]);

  const handleMouseUp = useCallback(() => {
    // Only create block if we moved enough to start dragging
    if (hasMovedEnough && dragStart !== null && dragEnd !== null) {
      const startMinutes = Math.min(dragStart, dragEnd);
      const endMinutes = Math.max(dragStart, dragEnd);

      // Only create if dragged at least 5 minutes
      if (endMinutes - startMinutes >= 5) {
        const startTime = minutesToTimeString(startMinutes);
        const endTime = minutesToTimeString(endMinutes);
        onBlockCreated(startTime, endTime);

        // Haptic feedback on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setDragStartPixel(null);
    setHasMovedEnough(false);
  }, [hasMovedEnough, dragStart, dragEnd, onBlockCreated]);

  // Add global mouse and touch listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleTouchMove, handleMouseUp]);

  // Render hour markers
  const renderHourMarkers = () => {
    const markers = [];
    for (let hour = 0; hour < 24; hour++) {
      const minutes = hour * 60;
      const top = (minutes / (24 * 60)) * 100;

      markers.push(
        <div
          key={hour}
          className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700/60"
          style={{ top: `${top}%` }}
        >
          <span className="absolute -left-12 sm:-left-14 -top-2 text-xs text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap">
            {formatHourTo12Hour(hour)}
          </span>
        </div>
      );
    }
    return markers;
  };

  // Render existing time blocks
  const renderTimeBlocks = () => {
    return sortTimeBlocks(timeBlocks).map((block) => {
      const startMinutes = timeStringToMinutes(block.startTime);
      const duration = calculateDuration(block.startTime, block.endTime);
      const segments = getTimelineSegments(startMinutes, duration);

      return segments.map((segment, index) => {
        const top = (segment.start / totalDayMinutes) * 100;
        const height = (segment.duration / totalDayMinutes) * 100;

        // Calculate pixel height for smart text fitting
        const pixelHeight = (segment.duration / totalDayMinutes) * timelineHeight;
        const isVeryShort = pixelHeight < 28;
        const isShort = pixelHeight < 44;
        const isMedium = pixelHeight < 60;

        return (
          <div
            key={`${block.id}-${index}`}
            className={`absolute left-12 sm:left-14 right-2 sm:right-4 rounded-lg group overflow-hidden ${readOnly ? 'cursor-default' : 'cursor-pointer transition-all hover:shadow-lg active:scale-95 sm:hover:scale-[1.02] touch-manipulation'}`}
            style={{
              top: `${top}%`,
              height: `${height}%`,
              backgroundColor: block.color,
              minHeight: '20px',
            }}
            onClick={readOnly ? undefined : () => onBlockClick(block)}
            title={`${block.label} (${formatTo12Hour(block.startTime)} - ${formatTo12Hour(block.endTime)})`}
          >
            {isVeryShort ? (
              <div className="px-2 py-0.5 text-white font-medium flex items-center h-full" style={{ fontSize: '10px' }}>
                <span className="truncate">{block.label}</span>
              </div>
            ) : isShort ? (
              <div className="px-2 sm:px-3 py-1 text-white font-medium text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{block.label}</span>
                  {index === 0 && (
                    <span className="opacity-75 whitespace-nowrap flex-shrink-0" style={{ fontSize: '10px' }}>
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
              </div>
            ) : isMedium ? (
              <div className="px-2 sm:px-3 py-1.5 text-white font-medium text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{block.label}</span>
                  {index === 0 && (
                    <span className="text-xs opacity-75 whitespace-nowrap flex-shrink-0">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 text-white font-medium text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{block.label}</span>
                  {index === 0 && (
                    <span className="text-xs opacity-75 whitespace-nowrap flex-shrink-0">
                      {formatDuration(duration)}
                    </span>
                  )}
                </div>
                {index === 0 && pixelHeight > 80 && (
                  <div className="text-xs opacity-60 mt-0.5">
                    {formatTo12Hour(block.startTime)} - {formatTo12Hour(block.endTime)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      });
    });
  };

  // Render dragging preview
  const renderDragPreview = () => {
    if (!isDragging || !hasMovedEnough || dragStart === null || dragEnd === null) return null;

    const startMinutes = Math.min(dragStart, dragEnd);
    const duration = Math.abs(dragEnd - dragStart);
    const segments = getTimelineSegments(startMinutes, duration);

    return segments.map((segment, index) => (
      <div
        key={`preview-${segment.start}-${index}`}
        className="absolute left-12 sm:left-14 right-2 sm:right-4 rounded-lg border-2 border-dashed border-gray-400 dark:border-gray-500 pointer-events-none bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30"
        style={{
          top: `${(segment.start / totalDayMinutes) * 100}%`,
          height: `${(segment.duration / totalDayMinutes) * 100}%`,
          opacity: 0.7,
        }}
      >
        {index === 0 && (
          <div className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-700 dark:text-gray-200 font-medium text-xs sm:text-sm">
            <div className="text-xs">
              {formatTo12Hour(minutesToTimeString(startMinutes))} - {formatTo12Hour(minutesToTimeString((startMinutes + duration) % totalDayMinutes))}
            </div>
            <div className="text-xs opacity-75">
              {formatDuration(duration)}
            </div>
          </div>
        )}
      </div>
    ));
  };

  return (
    <div ref={scrollRef} className={`flex-1 overflow-auto ${readOnly ? '' : 'select-none'} ${preview ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-950'}`}>
      <div className={preview ? 'mx-auto max-w-md px-3 py-2' : 'mx-auto max-w-4xl px-2 sm:px-4 lg:px-6 py-1 sm:py-4 lg:py-8 pb-2 sm:pb-8 lg:pb-8'}>
        {!preview && <div className="mb-2 sm:mb-4 lg:mb-6 hidden lg:block">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Timeline View
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
            Drag on the timeline to create time blocks (5-minute intervals)
          </p>
        </div>}

        {/* Timeline Container */}
        <div className="relative pl-12 sm:pl-14 lg:pl-16">
          <div
            ref={timelineRef}
            className={`relative bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 rounded-lg shadow-sm ${readOnly ? '' : 'cursor-crosshair'}`}
            style={{ height: `${timelineHeight}px` }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {renderHourMarkers()}
            {renderTimeBlocks()}
            {renderDragPreview()}
          </div>
        </div>
      </div>
    </div>
  );
}
