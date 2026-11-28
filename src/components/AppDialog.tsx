import type { ReactNode } from 'react';
import Modal from 'react-modal';

Modal.setAppElement('#root');

interface AppDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Shared popup for menu panels (Settings, Schedules, Feedback) so users stay on the chart.
 * Desktop: centered card. Mobile: sheet anchored to the bottom.
 * The header stays pinned while long content scrolls.
 * Confirmations belong inline inside the content (✕ / ✓), never in a second popup.
 */
export default function AppDialog({ isOpen, onClose, title, children }: AppDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      contentLabel={title}
      overlayClassName="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]"
      className="w-full sm:max-w-2xl sm:mx-4 max-h-[92vh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border shadow-2xl outline-none overflow-hidden"
      style={{ content: { background: 'var(--surface)', borderColor: 'var(--border)' } }}
    >
      <div
        className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-lg font-bold my-0" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 rounded-lg border-none bg-transparent shadow-none hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">
        {children}
      </div>
    </Modal>
  );
}
