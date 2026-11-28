// Core types for the redesigned schedule system

export interface TimeBlock {
  id: string;
  startTime: string; // Format: "HH:MM" in 5-min increments (e.g., "07:15", "14:30")
  endTime: string;   // Format: "HH:MM" in 5-min increments
  label: string;
  color: string;
  order: number;
}

export interface Schedule {
  id: string;
  name: string;
  description?: string;
  timeBlocks: TimeBlock[];
  userId: string;
  isDefault: boolean;
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string;
  timeBlocks: Omit<TimeBlock, 'id'>[];
  category: 'work' | 'personal' | 'fitness' | 'study' | 'custom';
  isPublic: boolean;
  userId: string;
  createdAt: Date;
}

export interface TimeRange {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export type TimeBlockInput = Omit<TimeBlock, 'id' | 'order'>;
export type ViewMode = 'chart' | 'timeline' | 'both';
export type NavRoute = 'dashboard' | 'schedules' | 'settings' | 'feedback' | 'changelog' | 'ai-assistant';
