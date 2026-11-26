import { useState } from 'react';
import { signOutUser } from '../auth';
import type { NavRoute, Schedule } from '../types/schedule';

interface SidebarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  userEmail?: string | null;
  isGuestMode?: boolean;
  isDark?: boolean;
  onToggleDark?: () => void;
  schedules?: Schedule[];
  currentScheduleId?: string | null;
  onScheduleSelect?: (id: string) => void;
  onCreateSchedule?: () => void;
  onClearSchedule?: () => void;
}

const handleSignOut = async () => {
  if (confirm('Are you sure you want to sign out?')) {
    try {
      await signOutUser();
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out');
    }
  }
};

export default function Sidebar({
  currentRoute,
  onNavigate,
  userEmail,
  isGuestMode,
  isDark,
  onToggleDark,
  schedules,
  currentScheduleId,
  onScheduleSelect,
  onCreateSchedule,
  onClearSchedule,
}: SidebarProps) {
  const [showScheduleDropdown, setShowScheduleDropdown] = useState(false);

  const navItems: Array<{
    route: NavRoute;
    title: string;
    isAI?: boolean;
    renderIcon: () => React.ReactElement;
  }> = [
    {
      route: 'dashboard',
      title: 'Schedule Editor',
      renderIcon: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      route: 'schedules',
      title: 'Schedules',
      renderIcon: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      route: 'ai-assistant',
      title: 'AI Assistant',
      isAI: true,
      renderIcon: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      route: 'settings',
      title: 'Settings',
      renderIcon: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <aside
      className="bg-gray-900 border-r border-gray-800/60 flex flex-col h-screen sticky top-0 w-16"
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-center border-b border-gray-800/60">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 flex flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive = currentRoute === item.route;
          return (
            <button
              key={item.route}
              onClick={() => onNavigate(item.route)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors border-none shadow-none p-0 ${
                isActive
                  ? item.isAI
                    ? 'bg-violet-600 text-white'
                    : 'bg-blue-600 text-white'
                  : item.isAI
                  ? 'text-violet-400 hover:bg-violet-900/30 hover:text-violet-300'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
              title={item.title}
            >
              <div className="relative">
                {item.renderIcon()}
                {item.isAI && !isActive && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-violet-500 rounded-full" />
                )}
              </div>
            </button>
          );
        })}

        {/* Schedule switcher — only on dashboard when schedules exist */}
        {currentRoute === 'dashboard' && schedules && schedules.length > 0 && (
          <div className="relative mt-1">
            <button
              onClick={() => setShowScheduleDropdown((v) => !v)}
              className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors border-none shadow-none p-0 ${
                showScheduleDropdown
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              }`}
              title="Switch schedule"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
              </svg>
            </button>

            {showScheduleDropdown && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowScheduleDropdown(false)}
                />
                <div className="absolute left-12 top-0 w-64 bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl shadow-black/60 py-1.5 z-50 max-h-80 overflow-y-auto">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Schedules
                  </div>
                  {schedules.map((schedule) => (
                    <button
                      key={schedule.id}
                      onClick={() => {
                        onScheduleSelect?.(schedule.id);
                        setShowScheduleDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors flex items-center justify-between border-none shadow-none ${
                        schedule.id === currentScheduleId
                          ? 'bg-blue-600/20 text-blue-300'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span className="truncate flex-1">{schedule.name}</span>
                      {schedule.id === currentScheduleId && (
                        <svg
                          className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 ml-2"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      onCreateSchedule?.();
                      setShowScheduleDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 border-none shadow-none"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Schedule
                  </button>
                  {onClearSchedule && (
                    <button
                      onClick={() => {
                        onClearSchedule();
                        setShowScheduleDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2 border-none shadow-none"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear All Blocks
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="py-3 flex flex-col items-center gap-1 border-t border-gray-800/60">
        {onToggleDark && (
          <button
            onClick={onToggleDark}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors border-none shadow-none p-0"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        )}

        {userEmail && (
          <button
            onClick={handleSignOut}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-white text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition-colors border-none shadow-none p-0"
            title={`${userEmail} · Sign Out`}
          >
            {userEmail[0].toUpperCase()}
          </button>
        )}
        {isGuestMode && !userEmail && (
          <div
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-900/30 text-amber-400"
            title="Guest Mode"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>
    </aside>
  );
}
