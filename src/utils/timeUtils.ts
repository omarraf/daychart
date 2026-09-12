import type { TimeBlock, TimeRange } from '../types/schedule';

/**
 * Snap a time value to the nearest 5-minute interval
 * @param minutes Total minutes (0-1439)
 * @returns Snapped minutes
 */
export const snapToFiveMinutes = (minutes: number): number => {
  return Math.round(minutes / 5) * 5;
};

/**
 * Convert minutes to HH:MM format
 * @param minutes Total minutes (0-1439)
 * @returns Time string in "HH:MM" format
 */
export const minutesToTimeString = (minutes: number): string => {
  const snapped = snapToFiveMinutes(minutes);
  const totalMinutes = (snapped % (24 * 60) + 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Convert HH:MM format to total minutes
 * @param timeString Time in "HH:MM" format
 * @returns Total minutes
 */
export const timeStringToMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Calculate duration between two times in minutes
 * @param start Start time "HH:MM"
 * @param end End time "HH:MM"
 * @returns Duration in minutes
 */
export const calculateDuration = (start: string, end: string): number => {
  const startMinutes = timeStringToMinutes(start);
  let endMinutes = timeStringToMinutes(end);

  // Handle overnight duration
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
  }

  return endMinutes - startMinutes;
};

export const adjustTimeBlock = (
  block: TimeBlock,
  mode: 'move' | 'start' | 'end',
  deltaMinutes: number
): TimeBlock => {
  const start = timeStringToMinutes(block.startTime);
  const duration = calculateDuration(block.startTime, block.endTime);
  const delta = snapToFiveMinutes(deltaMinutes);
  let nextStart = start;
  let nextEnd = start + duration;

  if (mode === 'move') {
    nextStart += delta;
    nextEnd += delta;
  } else if (mode === 'start') {
    nextStart += Math.max(duration - 1435, Math.min(duration - 5, delta));
  } else {
    nextEnd += Math.max(5 - duration, Math.min(1435 - duration, delta));
  }

  return {
    ...block,
    startTime: minutesToTimeString(nextStart),
    endTime: minutesToTimeString(nextEnd),
  };
};

/**
 * Format duration as human-readable string
 * @param minutes Duration in minutes
 * @returns Formatted string (e.g., "2.5 hours", "45 minutes")
 */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  if (mins === 30) {
    return `${hours}.5 hours`;
  }

  return `${hours}h ${mins}m`;
};

/**
 * Check if two time ranges overlap
 * @param range1 First time range
 * @param range2 Second time range
 * @returns True if ranges overlap
 */
const expandRangeToSegments = (range: TimeRange): Array<{ start: number; end: number }> => {
  const start = timeStringToMinutes(range.start);
  const end = timeStringToMinutes(range.end);
  const totalMinutes = 24 * 60;

  if (end > start) {
    return [{ start, end }];
  }

  return [
    { start, end: totalMinutes },
    { start: 0, end },
  ].filter(segment => segment.start !== segment.end);
};

export const doTimeRangesOverlap = (range1: TimeRange, range2: TimeRange): boolean => {
  const segments1 = expandRangeToSegments(range1);
  const segments2 = expandRangeToSegments(range2);

  return segments1.some(seg1 =>
    segments2.some(seg2 => seg1.start < seg2.end && seg2.start < seg1.end),
  );
};

/**
 * Validate that a new time block doesn't overlap with existing blocks
 * @param newBlock New time block to validate
 * @param existingBlocks Existing time blocks
 * @param excludeId Optional ID to exclude from validation (for editing)
 * @returns { valid: boolean, message?: string }
 */
export const validateTimeBlock = (
  newBlock: { startTime: string; endTime: string },
  existingBlocks: TimeBlock[],
  excludeId?: string
): { valid: boolean; message?: string } => {
  const duration = calculateDuration(newBlock.startTime, newBlock.endTime);

  if (duration <= 0) {
    return {
      valid: false,
      message: 'End time must be after start time',
    };
  }

  // Check for overlaps with existing blocks
  for (const block of existingBlocks) {
    if (excludeId && block.id === excludeId) continue;

    if (doTimeRangesOverlap(
      { start: newBlock.startTime, end: newBlock.endTime },
      { start: block.startTime, end: block.endTime }
    )) {
      return {
        valid: false,
        message: `Overlaps with "${block.label}" (${block.startTime} - ${block.endTime})`,
      };
    }
  }

  return { valid: true };
};

/**
 * Generate array of time slots for a day (5-minute intervals)
 * @returns Array of time strings
 */
export const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let i = 0; i < 24 * 60; i += 5) {
    slots.push(minutesToTimeString(i));
  }
  return slots;
};

/**
 * Get the current time rounded to nearest 5 minutes
 * @returns Current time as "HH:MM"
 */
export const getCurrentTimeRounded = (): string => {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutesToTimeString(minutes);
};

/**
 * Convert 24-hour time to 12-hour format
 * @param time24 Time in "HH:MM" 24-hour format
 * @returns Time in 12-hour format (e.g., "3:00 PM", "12:00 AM")
 */
export const formatTo12Hour = (time24: string): string => {
  const [hours24, minutes] = time24.split(':').map(Number);
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

/**
 * Format hour (0-23) to 12-hour format
 * @param hour Hour in 24-hour format (0-23)
 * @returns Formatted hour string (e.g., "12 AM", "3 PM")
 */
export const formatHourTo12Hour = (hour: number): string => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12} ${period}`;
};

/**
 * Sort time blocks by start time
 * @param blocks Array of time blocks
 * @returns Sorted array
 */
export const sortTimeBlocks = (blocks: TimeBlock[]): TimeBlock[] => {
  return [...blocks].sort((a, b) => {
    return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
  });
};

/**
 * Calculate percentage of day for a time block (for chart rendering)
 * @param block Time block
 * @returns Percentage (0-100)
 */
export const calculateBlockPercentage = (block: TimeBlock): number => {
  const duration = calculateDuration(block.startTime, block.endTime);
  return (duration / (24 * 60)) * 100;
};
