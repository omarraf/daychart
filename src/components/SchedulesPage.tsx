import { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { Schedule } from '../types/schedule';
import {
  getUserSchedules,
  deleteSchedule,
  duplicateSchedule,
  setDefaultSchedule,
  saveSchedule,
  updateSchedule,
} from '../services/scheduleService';
import { calculateDuration, timeStringToMinutes } from '../utils/timeUtils';

interface SchedulesPageProps {
  user: User;
  currentScheduleId: string | null;
  onScheduleSelect: (scheduleId: string) => void;
}

export default function SchedulesPage({
  user,
  currentScheduleId,
  onScheduleSelect,
}: SchedulesPageProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingScheduleName, setEditingScheduleName] = useState('');
  // Destructive/duplicating actions confirm inline (✕ / ✓) instead of a browser dialog
  const [pendingAction, setPendingAction] = useState<{ id: string; type: 'duplicate' | 'delete' } | null>(null);
  const [error, setError] = useState('');

  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    try {
      const userSchedules = await getUserSchedules(user.uid);
      setSchedules(userSchedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
    setIsLoading(false);
  }, [user.uid]);

  // Load schedules
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleCreateSchedule = async () => {
    if (!newScheduleName.trim()) return;
    setError('');

    try {
      const newId = await saveSchedule(user.uid, {
        name: newScheduleName.trim(),
        timeBlocks: [],
        isDefault: schedules.length === 0,
      });

      await loadSchedules();
      setNewScheduleName('');
      setIsCreating(false);
      onScheduleSelect(newId);
    } catch (error) {
      console.error('Error creating schedule:', error);
      setError(error instanceof Error && error.message.includes('Maximum 10 schedules')
        ? error.message
        : 'Failed to create schedule');
    }
  };

  const handleDuplicate = async (scheduleId: string, name: string) => {
    setPendingAction(null);
    setError('');

    try {
      await duplicateSchedule(scheduleId, user.uid, `${name} (Copy)`);
      await loadSchedules();
    } catch (error) {
      console.error('Error duplicating schedule:', error);
      setError(error instanceof Error && error.message.includes('Maximum 10 schedules')
        ? error.message
        : 'Failed to duplicate schedule');
    }
  };

  const handleDelete = async (scheduleId: string) => {
    setPendingAction(null);
    setError('');

    try {
      await deleteSchedule(scheduleId, user.uid);
      await loadSchedules();

      // If deleted the current schedule, clear selection
      if (scheduleId === currentScheduleId && schedules.length > 1) {
        const remaining = schedules.filter(s => s.id !== scheduleId);
        if (remaining.length > 0) {
          onScheduleSelect(remaining[0].id);
        }
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      setError('Failed to delete schedule');
    }
  };

  const handleSetDefault = async (scheduleId: string) => {
    try {
      await setDefaultSchedule(scheduleId, user.uid);
      await loadSchedules();
    } catch (error) {
      console.error('Error setting default:', error);
      setError('Failed to set default schedule');
    }
  };

  const handleStartEdit = (scheduleId: string, currentName: string) => {
    setEditingScheduleId(scheduleId);
    setEditingScheduleName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingScheduleId(null);
    setEditingScheduleName('');
  };

  const handleSaveEdit = async (scheduleId: string) => {
    if (!editingScheduleName.trim()) {
      setError('Schedule name cannot be empty');
      return;
    }
    setError('');

    try {
      await updateSchedule(scheduleId, user.uid, {
        name: editingScheduleName.trim(),
      });
      await loadSchedules();
      setEditingScheduleId(null);
      setEditingScheduleName('');
    } catch (error) {
      console.error('Error updating schedule name:', error);
      setError('Failed to update schedule name');
    }
  };

  const iconButtonClass = 'w-8 h-8 p-0 flex items-center justify-center rounded-lg border-none bg-transparent shadow-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed';
  const atLimit = schedules.length >= 10;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" aria-label="Loading schedules" />
      </div>
    );
  }

  return (
    <div>
      {/* Header: count + create */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className={`text-sm my-0 ${atLimit ? 'text-red-600 dark:text-red-400' : ''}`} style={atLimit ? undefined : { color: 'var(--text-muted)' }}>
          {schedules.length} of 10 schedules
        </p>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            disabled={atLimit}
            className="h-9 inline-flex items-center gap-1.5 px-3 py-0 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold border-none disabled:opacity-50 disabled:cursor-not-allowed"
            title={atLimit ? 'Maximum 10 schedules reached' : 'Create a new schedule'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
            New schedule
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Create Schedule Form */}
      {isCreating && (
        <div className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={newScheduleName}
            onChange={(e) => setNewScheduleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSchedule();
              if (e.key === 'Escape') { e.stopPropagation(); setIsCreating(false); setNewScheduleName(''); }
            }}
            placeholder="Schedule name, e.g. Work week"
            aria-label="New schedule name"
            className="flex-1 min-w-0 h-10 px-3 mb-0 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            autoFocus
          />
          <button
            onClick={() => { setIsCreating(false); setNewScheduleName(''); }}
            className={`${iconButtonClass} w-10 h-10`}
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cancel"
            title="Cancel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            onClick={handleCreateSchedule}
            disabled={!newScheduleName.trim()}
            className="w-10 h-10 p-0 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white border-none disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Create schedule"
            title="Create"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Schedules List */}
      {schedules.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium my-0" style={{ color: 'var(--text-primary)' }}>No schedules yet</p>
          <p className="text-sm mt-1 mb-0" style={{ color: 'var(--text-muted)' }}>
            Create your first schedule to start organizing your time.
          </p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 space-y-2">
          {schedules.map((schedule) => {
            const isActive = schedule.id === currentScheduleId;
            const pending = pendingAction?.id === schedule.id ? pendingAction : null;
            const isEditing = editingScheduleId === schedule.id;
            const isClickable = !isActive && !pending && !isEditing;

            return (
              <li
                key={schedule.id}
                className={`relative rounded-xl border p-3 transition-colors ${
                  isActive ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/15' : isClickable ? 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]' : ''
                }`}
                style={isActive ? undefined : { borderColor: 'var(--border)' }}
              >
                {/* The whole card opens the schedule; buttons inside sit above this layer */}
                {isClickable && (
                  <button
                    type="button"
                    onClick={() => onScheduleSelect(schedule.id)}
                    aria-label={`Open ${schedule.name}`}
                    className="absolute inset-0 w-full h-full p-0 rounded-xl border-none bg-transparent shadow-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                )}
                <div className="relative pointer-events-none flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 pointer-events-auto">
                        <input
                          type="text"
                          value={editingScheduleName}
                          onChange={(e) => setEditingScheduleName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(schedule.id);
                            if (e.key === 'Escape') { e.stopPropagation(); handleCancelEdit(); }
                          }}
                          aria-label="Schedule name"
                          className="flex-1 min-w-0 h-8 px-2.5 mb-0 rounded-lg border border-blue-500 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
                          autoFocus
                        />
                        <button onClick={handleCancelEdit} className={iconButtonClass} style={{ color: 'var(--text-muted)' }} aria-label="Cancel rename" title="Cancel">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                        <button onClick={() => handleSaveEdit(schedule.id)} className="w-8 h-8 p-0 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white border-none" aria-label="Save name" title="Save">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{schedule.name}</span>
                        <button
                          onClick={() => handleStartEdit(schedule.id, schedule.name)}
                          className="pointer-events-auto w-6 h-6 p-0 flex-shrink-0 flex items-center justify-center rounded-md border-none bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/10"
                          style={{ color: 'var(--text-muted)' }}
                          aria-label={`Rename ${schedule.name}`}
                          title="Rename"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {isActive && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Active</span>
                        )}
                      </div>
                    )}
                    <p className="text-xs mt-0.5 mb-0" style={{ color: 'var(--text-muted)' }}>
                      {schedule.timeBlocks.length} block{schedule.timeBlocks.length !== 1 ? 's' : ''} · Updated{' '}
                      {new Date(schedule.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  {/* Actions, or an inline ✕ / ✓ confirmation */}
                  {pending ? (
                    <div className="pointer-events-auto flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto">
                      <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-primary)' }}>
                        {pending.type === 'delete' ? 'Delete?' : 'Duplicate?'}
                      </span>
                      <button onClick={() => setPendingAction(null)} className={iconButtonClass} style={{ color: 'var(--text-muted)' }} aria-label="Cancel" title="Cancel">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <button
                        onClick={() => pending.type === 'delete' ? handleDelete(schedule.id) : handleDuplicate(schedule.id, schedule.name)}
                        className={`w-8 h-8 p-0 flex items-center justify-center rounded-lg text-white border-none ${pending.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        aria-label={pending.type === 'delete' ? `Confirm delete ${schedule.name}` : `Confirm duplicate ${schedule.name}`}
                        title="Confirm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </div>
                  ) : !isEditing && (
                    <div className="pointer-events-auto flex items-center gap-0.5 flex-shrink-0 self-end sm:self-auto" style={{ color: 'var(--text-muted)' }}>
                      <button
                        onClick={() => { if (!schedule.isDefault) handleSetDefault(schedule.id); }}
                        className={`${iconButtonClass} ${schedule.isDefault ? 'text-amber-500 dark:text-amber-400 cursor-default hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                        aria-pressed={schedule.isDefault}
                        aria-label={schedule.isDefault ? `${schedule.name} opens on startup` : `Open ${schedule.name} on startup`}
                        title={schedule.isDefault ? 'Opens on startup' : 'Open this schedule on startup'}
                      >
                        <svg className="w-4 h-4" fill={schedule.isDefault ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.11a.56.56 0 00.47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 00-.18.56l1.28 5.38a.56.56 0 01-.84.61l-4.72-2.88a.56.56 0 00-.59 0l-4.72 2.88a.56.56 0 01-.84-.61l1.28-5.38a.56.56 0 00-.18-.56l-4.2-3.6a.56.56 0 01.32-.99l5.52-.44a.56.56 0 00.47-.35l2.13-5.11z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setPendingAction({ id: schedule.id, type: 'duplicate' })}
                        disabled={atLimit}
                        className={iconButtonClass}
                        aria-label={`Duplicate ${schedule.name}`}
                        title={atLimit ? 'Maximum 10 schedules reached' : 'Duplicate'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setPendingAction({ id: schedule.id, type: 'delete' })}
                        className={`${iconButtonClass} hover:text-red-600 dark:hover:text-red-400`}
                        aria-label={`Delete ${schedule.name}`}
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Mini 24h strip: where this schedule's blocks fall in the day */}
                {schedule.timeBlocks.length > 0 && (
                  <div className="relative pointer-events-none mt-2.5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }} aria-hidden="true">
                    {schedule.timeBlocks.map((block) => {
                      const start = timeStringToMinutes(block.startTime);
                      const duration = calculateDuration(block.startTime, block.endTime);
                      return (
                        <div
                          key={block.id}
                          className="absolute top-0 h-full"
                          style={{
                            left: `${(start / 1440) * 100}%`,
                            width: `${(Math.min(duration, 1440 - start) / 1440) * 100}%`,
                            background: block.color,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
