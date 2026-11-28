import { useState } from 'react';
import Modal from 'react-modal';
import { formatDuration, calculateDuration, formatTo12Hour } from '../utils/timeUtils';

function TimePicker({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [hours, minutes] = value.split(':').map(Number);
  const hour = hours % 12 || 12;
  const period = hours >= 12 ? 'PM' : 'AM';
  // Hour and minute sit snugly around the colon instead of stretching across the field
  const timePartClass = 'w-10 h-9 appearance-none cursor-pointer rounded-md border-0 bg-transparent p-0 text-center text-base font-medium tabular-nums text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none';

  const update = (nextHour: number, nextMinutes: number, nextPeriod: string) => {
    const hour24 = nextHour % 12 + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(hour24).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`);
  };

  return (
    <fieldset className="min-w-0 m-0 p-0 border-0">
      <legend className="mb-1.5 p-0 text-sm font-medium text-gray-700 dark:text-gray-300">{label}</legend>
      <div className="flex items-center h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-1.5 pr-1 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30">
        <select aria-label={`${label} hour`} value={hour} className={timePartClass} style={{ textAlignLast: 'center' }}
          onChange={(event) => update(Number(event.target.value), minutes, period)}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <span aria-hidden="true" className="px-0.5 text-base font-medium text-gray-400 dark:text-gray-500">:</span>
        <select aria-label={`${label} minute`} value={minutes} className={timePartClass} style={{ textAlignLast: 'center' }}
          onChange={(event) => update(hour, Number(event.target.value), period)}>
          {Array.from({ length: 12 }, (_, index) => index * 5).map((option) => (
            <option key={option} value={option}>{String(option).padStart(2, '0')}</option>
          ))}
        </select>

        {/* AM / PM as a two-way switch inside the same field */}
        <div role="group" aria-label={`${label} AM or PM`} className="ml-auto flex rounded-md bg-gray-100 dark:bg-gray-900 p-0.5">
          {(['AM', 'PM'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={period === option}
              onClick={() => update(hour, minutes, option)}
              className={`h-8 px-2.5 py-0 rounded text-xs font-semibold border-none transition-colors focus:ring-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 ${
                // Solid fill for the selected option: a white-on-white pill relied on a shadow that focus styles clear
                period === option
                  ? 'bg-blue-600 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-600'
                  : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-transparent dark:hover:bg-transparent hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

interface LabelModalProps {
  isOpen: boolean;
  startTime: string;
  endTime: string;
  onClose: () => void;
  onSave: (label: string, color: string, startTime: string, endTime: string) => string | undefined;
  onDelete?: () => void;
  availableColors: string[];
  mode?: 'create' | 'edit';
  initialLabel?: string;
  initialColor?: string;
}

export default function LabelModal({
  isOpen,
  startTime,
  endTime,
  onClose,
  onSave,
  onDelete,
  availableColors,
  mode = 'create',
  initialLabel = '',
  initialColor,
}: LabelModalProps) {
  const [label, setLabel] = useState(initialLabel);
  const [selectedColor, setSelectedColor] = useState(initialColor || availableColors[0]);
  const [editedStart, setEditedStart] = useState(startTime);
  const [editedEnd, setEditedEnd] = useState(endTime);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const duration = calculateDuration(editedStart, editedEnd);
  const validTimes = duration >= 5;

  const handleSave = () => {
    if (label.trim() && validTimes) {
      const saveError = onSave(label.trim(), selectedColor, editedStart, editedEnd);
      if (saveError) setError(saveError);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && label.trim()) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
      setLabel('');
    }
  };

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const modalStyles = {
    overlay: {
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      zIndex: 1000,
    },
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
      border: 'none',
      borderRadius: '16px',
      padding: 0,
      maxWidth: '500px',
      maxHeight: '90vh',
      overflowY: 'auto' as const,
      width: '90%',
      background: isDark ? '#111827' : '#ffffff',
    },
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} style={modalStyles}>
      <div className="p-5 sm:p-8">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {mode === 'edit' ? 'Edit Time Block' : 'Create Time Block'}
        </h3>
        <div className="flex items-center gap-3 mb-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {`${formatTo12Hour(editedStart)} - ${formatTo12Hour(editedEnd)}`}
          </div>
          <div className="w-1 h-1 rounded-full bg-gray-400"></div>
          <div className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {validTimes ? formatDuration(duration) : ''}
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TimePicker label="Start time" value={editedStart}
              onChange={(value) => { setEditedStart(value); setError(''); }} />
            <TimePicker label="End time" value={editedEnd}
              onChange={(value) => { setEditedEnd(value); setError(''); }} />
          </div>
          <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
            Minutes move in 5-minute steps. An earlier end time finishes the next day.
          </p>
          {(!validTimes || error) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error || 'Start and end times must be at least 5 minutes apart.'}
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Label
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Work, Gym, Study..."
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:outline-none transition-all"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Color
            </label>
            <div className="grid grid-cols-5 gap-3">
              {availableColors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`h-12 rounded-lg transition-all border-none bg-transparent p-0 ${
                    selectedColor === color
                      ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 scale-105'
                      : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap gap-3 mt-8">
          {mode === 'edit' && onDelete && (
            confirmingDelete ? (
              // Inline ✕ / ✓ instead of a browser confirm dialog
              <div className="flex flex-1 sm:flex-none items-center gap-2">
                <span className="text-sm font-medium whitespace-nowrap text-gray-700 dark:text-gray-300">Delete?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  aria-label="Cancel delete"
                  title="Cancel"
                  className="w-11 h-11 p-0 flex items-center justify-center rounded-lg border-none bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => { onDelete(); onClose(); }}
                  aria-label="Confirm delete"
                  title="Delete"
                  className="w-11 h-11 p-0 flex items-center justify-center rounded-lg border-none bg-red-600 hover:bg-red-700 text-white"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex-1 sm:flex-none whitespace-nowrap px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 active:scale-95 transition-all border-none"
              >
                Delete
              </button>
            )
          )}
          <button
            onClick={handleSave}
            disabled={!label.trim() || !validTimes}
            className="order-first sm:order-none basis-full sm:basis-0 flex-1 whitespace-nowrap px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none"
          >
            {mode === 'edit' ? 'Save Changes' : 'Create Block'}
          </button>
          <button
            onClick={() => {
              onClose();
              setLabel(initialLabel);
              setSelectedColor(initialColor || availableColors[0]);
            }}
            className="flex-1 sm:flex-none whitespace-nowrap px-6 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95 transition-all bg-transparent"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
