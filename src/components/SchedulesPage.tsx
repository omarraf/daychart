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
import { formatTo12Hour } from '../utils/timeUtils';

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
      if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
        alert(error.message);
      } else {
        alert('Failed to create schedule');
      }
    }
  };

  const handleDuplicate = async (scheduleId: string, name: string) => {
    if (!confirm(`Duplicate "${name}"?`)) return;

    try {
      await duplicateSchedule(scheduleId, user.uid, `${name} (Copy)`);
      await loadSchedules();
      alert('Schedule duplicated successfully');
    } catch (error) {
      console.error('Error duplicating schedule:', error);
      if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
        alert(error.message);
      } else {
        alert('Failed to duplicate schedule');
      }
    }
  };

  const handleDelete = async (scheduleId: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

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
      alert('Failed to delete schedule');
    }
  };

  const handleSetDefault = async (scheduleId: string) => {
    try {
      await setDefaultSchedule(scheduleId, user.uid);
      await loadSchedules();
    } catch (error) {
      console.error('Error setting default:', error);
      alert('Failed to set default schedule');
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
      alert('Schedule name cannot be empty');
      return;
    }

    try {
      await updateSchedule(scheduleId, user.uid, {
        name: editingScheduleName.trim(),
      });
      await loadSchedules();
      setEditingScheduleId(null);
      setEditingScheduleName('');
    } catch (error) {
      console.error('Error updating schedule name:', error);
      alert('Failed to update schedule name');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading schedules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 dark:bg-gray-950 p-4 sm:p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header with Create Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Your Schedules</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage your time schedules and templates {schedules.length > 0 && (
                <span className={`ml-2 font-medium ${schedules.length >= 10 ? 'text-red-600 dark:text-red-400' : schedules.length >= 8 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  ({schedules.length}/10 schedules)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            disabled={schedules.length >= 10}
            className="px-4 py-2 sm:px-6 sm:py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none whitespace-nowrap flex-shrink-0 text-sm sm:text-base"
            title={schedules.length >= 10 ? 'Maximum 10 schedules reached' : 'Create a new schedule'}
          >
            <span>+ New Schedule</span>
          </button>
        </div>

        {/* Create Schedule Form */}
        {isCreating && (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Create New Schedule</h4>
            <div className="flex gap-3">
              <input
                type="text"
                value={newScheduleName}
                onChange={(e) => setNewScheduleName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSchedule()}
                placeholder="Schedule name (e.g., Work Week, Weekend)"
                className="flex-1 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoFocus
              />
              <button
                onClick={handleCreateSchedule}
                disabled={!newScheduleName.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-none"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewScheduleName('');
                }}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors border-none"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Schedules List */}
        {schedules.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
            <div className="text-6xl mb-4">📅</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No schedules yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first schedule to start organizing your time
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors border-none"
            >
              Create Schedule
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border-2 transition-all hover:shadow-md ${
                  schedule.id === currentScheduleId
                    ? 'border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900/30'
                    : 'border-gray-200 dark:border-gray-800'
                }`}
              >
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1">
                      {editingScheduleId === schedule.id ? (
                        // Edit mode
                        <div className="mb-2">
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={editingScheduleName}
                              onChange={(e) => setEditingScheduleName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit(schedule.id);
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              className="flex-1 px-3 py-1.5 border-2 border-blue-500 rounded-lg focus:outline-none text-lg font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(schedule.id)}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm border-none"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm border-none"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {schedule.name}
                          </h4>
                          <button
                            onClick={() => handleStartEdit(schedule.id, schedule.name)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors border-none bg-transparent"
                            title="Edit schedule name"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          {schedule.isDefault && (
                            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                              Default
                            </span>
                          )}
                          {schedule.id === currentScheduleId && (
                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                              Active
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <span>{schedule.timeBlocks.length} time blocks</span>
                        <span>•</span>
                        <span>
                          Updated {new Date(schedule.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 flex-wrap sm:justify-end">
                      {schedule.id !== currentScheduleId && (
                        <button
                          onClick={() => onScheduleSelect(schedule.id)}
                          className="px-4 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-sm border-none"
                        >
                          Open
                        </button>
                      )}
                      {!schedule.isDefault && (
                        <button
                          onClick={() => handleSetDefault(schedule.id)}
                          className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm border-none"
                          title="Set as default"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => handleDuplicate(schedule.id, schedule.name)}
                        disabled={schedules.length >= 10}
                        className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm border-none disabled:opacity-50 disabled:cursor-not-allowed"
                        title={schedules.length >= 10 ? 'Maximum 10 schedules reached' : 'Duplicate'}
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id, schedule.name)}
                        className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm border-none"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Time blocks preview */}
                  {schedule.timeBlocks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                      <div className="flex gap-2 flex-wrap">
                        {schedule.timeBlocks.slice(0, 5).map((block) => (
                          <div
                            key={block.id}
                            className="px-3 py-1.5 rounded-lg text-white text-xs font-medium"
                            style={{ backgroundColor: block.color }}
                          >
                            {block.label} ({formatTo12Hour(block.startTime)}-{formatTo12Hour(block.endTime)})
                          </div>
                        ))}
                        {schedule.timeBlocks.length > 5 && (
                          <div className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs font-medium">
                            +{schedule.timeBlocks.length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
