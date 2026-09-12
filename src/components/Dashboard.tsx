import { useState, useEffect, useRef } from 'react';
import { auth, isFirebaseConfigured } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { signOutUser } from '../auth';
import Timeline from './Timeline';
import CircularChart from './CircularChart';
import LabelModal from './LabelModal';
import ExportPreviewModal from './ExportPreviewModal';
import SchedulesPage from './SchedulesPage';
import SettingsPage from './SettingsPage';
import FeedbackPage from './FeedbackPage';
import AuthButtons from './AuthButtons';
import AIAssistant from './AIAssistant';
import type { DisplayMessage } from './AIAssistant';
import Footer from './Footer';
import type { NavRoute, TimeBlock } from '../types/schedule';
import {
  saveSchedule,
  updateSchedule,
  getDefaultSchedule,
  getSchedule,
  getUserSchedules,
} from '../services/scheduleService';
import type { Schedule } from '../types/schedule';
import {
  validateTimeBlock,
  sortTimeBlocks,
  calculateDuration,
  formatDuration,
  formatTo12Hour,
} from '../utils/timeUtils';
import { renderChartImage, downloadChartImage, type ChartImage } from '../utils/exportUtils';

const availableColors = [
  '#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa',
  '#fb923c', '#65a30d', '#f472b6', '#38bdf8', '#c084fc',
];

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<NavRoute>('dashboard');
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [viewMode, setViewMode] = useState<'linear' | 'circular'>('circular');
  const [showBlockList, setShowBlockList] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeBlock, setActiveBlock] = useState<TimeBlock | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Modal state
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<{ startTime: string; endTime: string } | null>(null);
  const [editingBlock, setEditingBlock] = useState<TimeBlock | null>(null);

  // Current schedule
  const [currentScheduleId, setCurrentScheduleId] = useState<string | null>(null);
  const [currentScheduleName, setCurrentScheduleName] = useState<string>('My Schedule');
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPreview, setExportPreview] = useState<ChartImage | null>(null);

  // AI Assistant chat state (lifted up to persist across navigation)
  const [aiMessages, setAiMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content:
        'Hi! I\'m your AI scheduling assistant. I can help you plan your day, suggest schedule improvements, or create a new schedule from scratch.\n\nHow can I help?',
      timestamp: new Date(),
    },
  ]);

  // Dark mode
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      );
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleDarkMode = () => setIsDark((prev) => !prev);

  const savingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoading(true);

      if (currentUser) {
        try {
          const [defaultSchedule, schedules] = await Promise.all([
            getDefaultSchedule(currentUser.uid),
            getUserSchedules(currentUser.uid),
          ]);

          setAllSchedules(schedules);

          if (defaultSchedule) {
            setTimeBlocks(defaultSchedule.timeBlocks);
            setCurrentScheduleId(defaultSchedule.id);
            setCurrentScheduleName(defaultSchedule.name);
          }
        } catch (error) {
          console.error('Error loading schedules:', error);
        }
      } else {
        setTimeBlocks([]);
        setCurrentScheduleId(null);
        setCurrentScheduleName('My Schedule');
        setAllSchedules([]);
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSaveSchedule = async () => {
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }

    if (savingRef.current) return;

    let scheduleName = currentScheduleName;

    if (!currentScheduleId) {
      const input = prompt('Enter a title for this schedule:', 'My Schedule');
      if (!input) return;
      scheduleName = input.trim() || 'My Schedule';
      setCurrentScheduleName(scheduleName);
    }

    savingRef.current = true;
    setSaveStatus('saving');

    try {
      const scheduleData = {
        name: scheduleName,
        timeBlocks: timeBlocks,
        isDefault: true,
      };

      if (currentScheduleId) {
        await updateSchedule(currentScheduleId, user.uid, scheduleData);
      } else {
        const newId = await saveSchedule(user.uid, scheduleData);
        setCurrentScheduleId(newId);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (error) {
      console.error('Error saving schedule:', error);
      setSaveStatus('error');
      if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
        alert(error.message);
      }
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      savingRef.current = false;
    }
  };

  const handleBlockCreated = (startTime: string, endTime: string) => {
    const validation = validateTimeBlock({ startTime, endTime }, timeBlocks);

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    setPendingBlock({ startTime, endTime });
    setShowLabelModal(true);
  };

  const handleSaveBlock = (label: string, color: string, startTime: string, endTime: string) => {
    const validation = validateTimeBlock({ startTime, endTime }, timeBlocks, editingBlock?.id);
    if (!validation.valid) return validation.message;

    if (editingBlock) {
      setTimeBlocks((prev) =>
        sortTimeBlocks(prev.map((block) => (block.id === editingBlock.id ? { ...block, label, color, startTime, endTime } : block)))
      );
      setEditingBlock(null);
    } else if (pendingBlock) {
      const newBlock: TimeBlock = {
        id: crypto.randomUUID(),
        startTime,
        endTime,
        label,
        color,
        order: timeBlocks.length,
      };
      setTimeBlocks((prev) => sortTimeBlocks([...prev, newBlock]));
      setPendingBlock(null);
    }
    setShowLabelModal(false);
  };

  const handleBlockChanged = (updatedBlock: TimeBlock) => {
    const validation = validateTimeBlock(updatedBlock, timeBlocks, updatedBlock.id);
    if (!validation.valid) return;
    setTimeBlocks((previous) => sortTimeBlocks(previous.map((block) =>
      block.id === updatedBlock.id ? updatedBlock : block
    )));
    setActiveBlock(null);
  };

  const handleDeleteBlock = () => {
    if (editingBlock) {
      setTimeBlocks((prev) => prev.filter((b) => b.id !== editingBlock.id));
      setEditingBlock(null);
      setShowLabelModal(false);
    }
  };

  const handleBlockClick = (block: TimeBlock) => {
    setEditingBlock(block);
    setShowLabelModal(true);
  };

  const handleScheduleSelect = async (scheduleId: string) => {
    if (!user) return;

    try {
      const schedule = await getSchedule(scheduleId, user.uid);
      if (schedule) {
        setTimeBlocks(schedule.timeBlocks);
        setCurrentScheduleId(schedule.id);
        setCurrentScheduleName(schedule.name);
        if (currentRoute !== 'dashboard') {
          setCurrentRoute('dashboard');
        }
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
      alert('Failed to load schedule');
    }
  };

  const handleClearAllBlocks = () => {
    if (
      !confirm(
        'Are you sure you want to clear all time blocks from this schedule? This cannot be undone.'
      )
    ) {
      return;
    }
    setTimeBlocks([]);
  };

  const handleExportChart = async () => {
    const svgEl = chartContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    setIsExporting(true);
    try {
      const image = await renderChartImage(svgEl as SVGSVGElement, currentScheduleName, isDark);
      setExportPreview(image);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCloseExportPreview = () => {
    if (exportPreview) URL.revokeObjectURL(exportPreview.url);
    setExportPreview(null);
  };

  const handleConfirmDownload = () => {
    if (!exportPreview) return;
    downloadChartImage(exportPreview);
    handleCloseExportPreview();
  };

  const handleCreateNewSchedule = async () => {
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }

    const scheduleName = prompt('Enter a name for the new schedule:', 'New Schedule');
    if (!scheduleName) return;

    try {
      const newId = await saveSchedule(user.uid, {
        name: scheduleName.trim(),
        timeBlocks: [],
        isDefault: false,
      });

      const schedules = await getUserSchedules(user.uid);
      setAllSchedules(schedules);

      setCurrentScheduleId(newId);
      setCurrentScheduleName(scheduleName.trim());
      setTimeBlocks([]);
    } catch (error) {
      console.error('Error creating schedule:', error);
      if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
        alert(error.message);
      } else {
        alert('Failed to create schedule');
      }
    }
  };

  const handleSignOut = async () => {
    setShowDrawer(false);
    if (confirm('Are you sure you want to sign out?')) {
      try {
        await signOutUser();
      } catch (error) {
        console.error('Error signing out:', error);
        alert('Failed to sign out');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Landing page for non-authenticated users
  if (!user && !isGuestMode) {
    return (
      <div className="min-h-screen overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-950">
        <AuthButtons />

        <div className="flex items-center justify-center p-4 sm:p-8 pt-24 sm:pt-28 pb-16 min-h-screen">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-10 sm:mb-14">
              <h1
                className="text-6xl sm:text-7xl lg:text-8xl font-black text-gray-900 dark:text-white mb-4 tracking-tight leading-none"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                DayChart
              </h1>
              <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                Visual time management — plan your day on a 24-hour clock dial
              </p>
              <div className="lg:hidden mt-5 px-4">
                <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-full px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Best experienced on desktop
                </div>
              </div>
            </div>

            <div className="text-center mb-10 sm:mb-14">
              <button
                onClick={() => setIsGuestMode(true)}
                className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/30 hover:bg-blue-700 hover:shadow-2xl hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all border-none"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Try It Free
              </button>
              <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
                No account needed
                {isFirebaseConfigured && (
                  <>
                    {' · '}
                    <span
                      onClick={() => {
                        const btn = document.querySelector<HTMLButtonElement>('nav button');
                        if (btn) btn.click();
                      }}
                      className="text-blue-500 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                    >
                      Sign in
                    </span>
                    {' '}to save & sync across devices
                  </>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-10">
              <div className="group bg-gray-50 dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Circular + Linear Views</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">24-hour clock dial or linear timeline — see your whole day at a glance</p>
              </div>

              <div className="group bg-gray-50 dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 hover:border-purple-200 dark:hover:border-purple-800 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Drag to Create</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Click and drag on the dial or timeline to create color-coded time blocks instantly</p>
              </div>

              <div className="group bg-gray-50 dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 hover:border-green-200 dark:hover:border-green-800 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Multiple Schedules</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Save separate schedules for work days, weekends, travel, and more</p>
              </div>

              <div className="group bg-gray-50 dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800 hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">AI Assistant</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Describe your ideal day in plain text and let AI build the schedule for you</p>
              </div>
            </div>

            {!isFirebaseConfigured && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 text-center">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Firebase not configured. Add your config to enable authentication and sync.
                </p>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const sortedBlocks = sortTimeBlocks(timeBlocks);

  // ─── Drawer nav items ────────────────────────────────────────────────────────
  const drawerNavItems: Array<{ route: NavRoute; label: string; icon: React.ReactElement }> = [
    {
      route: 'dashboard',
      label: 'Schedule Editor',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      route: 'schedules',
      label: 'Schedules',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      route: 'ai-assistant',
      label: 'AI Assistant',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
    {
      route: 'settings',
      label: 'Settings',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      route: 'feedback',
      label: 'Feedback',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 4v-4z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: 'var(--page-bg)' }}
    >
      {/* ═══════════════════════════════════════════════════
          CANVAS / ROUTE CONTENT
      ═══════════════════════════════════════════════════ */}

      {currentRoute === 'dashboard' && viewMode === 'linear' && (
        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ paddingTop: 56 }}>
          <Timeline
            timeBlocks={timeBlocks}
            onBlockCreated={handleBlockCreated}
            onBlockClick={handleBlockClick}
          />
        </div>
      )}

      {currentRoute === 'dashboard' && viewMode === 'circular' && (
        <div ref={chartContainerRef} className="absolute inset-0 flex items-center justify-center">
          <CircularChart
            timeBlocks={timeBlocks}
            onBlockChanged={handleBlockChanged}
            onBlockCreated={handleBlockCreated}
            onBlockClick={handleBlockClick}
            activeBlock={activeBlock}
          />
        </div>
      )}

      {currentRoute === 'schedules' && (
        <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: 60 }}>
          {user ? (
            <SchedulesPage
              user={user}
              currentScheduleId={currentScheduleId}
              onScheduleSelect={(id) => {
                handleScheduleSelect(id);
                setCurrentRoute('dashboard');
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface)' }}>
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Sign In to View Schedules</h3>
              <p style={{ color: 'var(--text-muted)' }}>Create an account to save and manage multiple schedules</p>
            </div>
          )}
        </div>
      )}

      {currentRoute === 'ai-assistant' && (
        <div className="absolute inset-0 flex flex-col" style={{ paddingTop: 60 }}>
          <AIAssistant
            timeBlocks={timeBlocks}
            messages={aiMessages}
            setMessages={setAiMessages}
            onApplySchedule={(newBlocks) => setTimeBlocks(newBlocks)}
          />
        </div>
      )}

      {currentRoute === 'settings' && (
        <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: 60 }}>
          {user ? (
            <SettingsPage user={user} timeBlocks={[]} currentScheduleName="" />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Sign In to Access Settings</h3>
              <p style={{ color: 'var(--text-muted)' }}>Sign in to manage your profile and preferences</p>
            </div>
          )}
        </div>
      )}

      {currentRoute === 'feedback' && (
        <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: 60 }}>
          <FeedbackPage />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          FLOATING UI — z-40
      ═══════════════════════════════════════════════════ */}

      {/* Hamburger — top-left 12px */}
      <button
        onClick={() => setShowDrawer(true)}
        className="fixed z-40 flex items-center justify-center rounded-lg transition-colors border-none p-0 shadow-sm hover:opacity-90"
        style={{
          top: 12, left: 12,
          width: 32, height: 32,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        title="Menu"
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Controls pill — centered top 12px, dashboard only */}
      {currentRoute === 'dashboard' && (
        <div
          className="fixed z-40 flex items-center rounded-full shadow-sm overflow-hidden"
          style={{
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 72px)',
            height: 32,
            padding: '0 6px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            gap: 0,
          }}
        >
          {/* Linear toggle */}
          <button
            onClick={() => setViewMode('linear')}
            className="border-none shadow-none rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              background: viewMode === 'linear' ? 'rgba(37,99,235,0.1)' : 'transparent',
              color: viewMode === 'linear' ? '#2563eb' : 'var(--text-muted)',
              cursor: 'pointer',
              height: 24,
            }}
          >
            Linear
          </button>
          {/* Circular toggle */}
          <button
            onClick={() => setViewMode('circular')}
            className="border-none shadow-none rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              background: viewMode === 'circular' ? 'rgba(37,99,235,0.1)' : 'transparent',
              color: viewMode === 'circular' ? '#2563eb' : 'var(--text-muted)',
              cursor: 'pointer',
              height: 24,
            }}
          >
            Circular
          </button>

          {/* Divider — hidden on small screens where List is hidden */}
          <div className="hidden sm:block" style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

          {/* List button — hidden on small screens */}
          <button
            onClick={() => setShowBlockList((v) => !v)}
            className="border-none shadow-none rounded-full transition-colors items-center justify-center px-2.5 hidden sm:flex"
            style={{
              height: 24,
              background: showBlockList ? 'rgba(37,99,235,0.1)' : 'transparent',
              color: showBlockList ? '#2563eb' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
            title={showBlockList ? 'Hide block list' : 'Show block list'}
          >
            List
          </button>

          {/* Export button — circular mode only, when blocks exist */}
          {viewMode === 'circular' && timeBlocks.length > 0 && (
            <>
              <div className="hidden sm:block" style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
              <button
                onClick={handleExportChart}
                disabled={isExporting}
                className="border-none shadow-none rounded-full transition-colors flex items-center justify-center gap-1 px-2.5 hidden sm:flex"
                style={{
                  height: 24,
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  opacity: isExporting ? 0.5 : 1,
                }}
                title="Export as PNG"
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{isExporting ? 'Exporting…' : 'Export'}</span>
              </button>
            </>
          )}

          {/* Clear button — only when blocks exist; icon-only on mobile */}
          {timeBlocks.length > 0 && (
            <>
              <div className="hidden sm:block" style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
              <button
                onClick={handleClearAllBlocks}
                className="border-none shadow-none rounded-full transition-colors flex items-center justify-center gap-1 px-2.5"
                style={{
                  height: 24,
                  background: 'transparent',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                title="Clear all blocks"
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Clear</span>
              </button>
            </>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

          {/* Save */}
          <button
            onClick={handleSaveSchedule}
            disabled={savingRef.current}
            className="border-none shadow-none rounded-full px-3 text-xs font-semibold transition-colors text-white disabled:opacity-50 flex items-center justify-center"
            style={{
              height: 24,
              cursor: 'pointer',
              background:
                saveStatus === 'saved' ? '#16a34a' :
                saveStatus === 'error' ? '#dc2626' :
                '#2563eb',
              whiteSpace: 'nowrap',
            }}
          >
            {saveStatus === 'saving' ? 'Saving…' :
             saveStatus === 'saved' ? 'Saved ✓' :
             saveStatus === 'error' ? 'Error' :
             'Save'}
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          BLOCK LIST RIGHT PANEL — z-[39] (below floating UI)
      ═══════════════════════════════════════════════════ */}

      {/* Click-away overlay (below pill at z-40, above canvas) */}
      {showBlockList && (
        <div
          className="fixed inset-0 z-[38]"
          onClick={() => setShowBlockList(false)}
        />
      )}

      {/* Panel — always rendered for transition */}
      <div
        className="fixed top-0 right-0 h-full z-[39] flex flex-col transition-transform duration-200 ease-out"
        style={{
          width: 280,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: showBlockList ? 'translateX(0)' : 'translateX(100%)',
          boxShadow: showBlockList ? '-8px 0 32px rgba(0,0,0,0.08)' : 'none',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Time Blocks
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {sortedBlocks.length} block{sortedBlocks.length !== 1 ? 's' : ''}
              {sortedBlocks.length > 0 && (
                <> · {formatDuration(sortedBlocks.reduce((s, b) => s + calculateDuration(b.startTime, b.endTime), 0))}</>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowBlockList(false)}
            className="border-none shadow-none rounded-md flex items-center justify-center transition-colors"
            style={{
              width: 24, height: 24,
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Panel list */}
        <div className="flex-1 overflow-y-auto">
          {sortedBlocks.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm" style={{ color: 'var(--text-muted)' }}>
              Drag on the dial to add blocks
            </div>
          ) : (
            sortedBlocks.map((block) => {
              const duration = calculateDuration(block.startTime, block.endTime);
              const isActive = activeBlock?.id === block.id;
              return (
                <button
                  key={block.id}
                  onClick={() => { handleBlockClick(block); setShowBlockList(false); }}
                  onMouseEnter={() => setActiveBlock(block)}
                  onMouseLeave={() => setActiveBlock(null)}
                  className="w-full flex items-center gap-3 border-none shadow-none transition-colors"
                  style={{
                    padding: '10px 16px',
                    background: isActive ? 'rgba(37,99,235,0.06)' : 'transparent',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    className="rounded-full flex-shrink-0"
                    style={{ width: 8, height: 8, background: block.color }}
                  />
                  <span
                    className="flex-1 text-sm font-medium truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {block.label}
                  </span>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatTo12Hour(block.startTime)} – {formatTo12Hour(block.endTime)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>
                      {formatDuration(duration)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          HAMBURGER DRAWER — z-[49/50]
      ═══════════════════════════════════════════════════ */}

      {showDrawer && (
        <div
          className="fixed inset-0 z-[49]"
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowDrawer(false)}
        />
      )}

      <div
        className="fixed top-0 left-0 h-full z-[50] flex flex-col transition-transform duration-200 ease-out"
        style={{
          width: 240,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          transform: showDrawer ? 'translateX(0)' : 'translateX(calc(-100% - 2px))',
          boxShadow: showDrawer ? '8px 0 32px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#2563eb' }}
          >
            <svg width="14" height="14" fill="none" stroke="#fff" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span
            className="text-base font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'Outfit, sans-serif' }}
          >
            DayChart
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2">
          {drawerNavItems.map((item) => {
            const isActive = currentRoute === item.route;
            return (
              <button
                key={item.route}
                onClick={() => { setCurrentRoute(item.route); setShowDrawer(false); }}
                className="w-full flex items-center gap-3 border-none shadow-none transition-colors rounded-none"
                style={{
                  padding: '9px 20px',
                  background: isActive ? 'rgba(37,99,235,0.08)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: isActive ? '#2563eb' : 'var(--text-primary)',
                }}
              >
                <span style={{ color: isActive ? '#2563eb' : 'var(--text-muted)' }}>
                  {item.icon}
                </span>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}

          {/* Schedule switcher inside drawer when schedules exist */}
          {allSchedules.length > 1 && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              <div className="px-5 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Schedules
              </div>
              <div className="max-h-40 overflow-y-auto">
                {allSchedules.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { handleScheduleSelect(s.id); setCurrentRoute('dashboard'); setShowDrawer(false); }}
                    className="w-full flex items-center gap-2.5 border-none shadow-none transition-colors rounded-none"
                    style={{
                      padding: '7px 20px',
                      background: s.id === currentScheduleId ? 'rgba(37,99,235,0.06)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: s.id === currentScheduleId ? '#2563eb' : 'var(--text-muted)' }}
                    />
                    <span
                      className="text-sm truncate flex-1"
                      style={{ color: s.id === currentScheduleId ? '#2563eb' : 'var(--text-primary)' }}
                    >
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => { handleCreateNewSchedule(); setShowDrawer(false); }}
                className="w-full flex items-center gap-2.5 border-none shadow-none transition-colors rounded-none text-blue-600"
                style={{ padding: '7px 20px', marginTop: '8px', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              >
                <svg className="w-1.5 h-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-medium">New Schedule</span>
              </button>
            </div>
          )}
        </nav>

        {/* Drawer footer */}
        <div style={{ borderTop: '1px solid var(--border)' }} className="py-2">
          {/* GitHub link */}
          <a
            href="https://github.com/omarraf/time-tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 transition-colors rounded-none no-underline"
            style={{
              padding: '9px 20px',
              color: 'var(--text-primary)',
              display: 'flex',
            }}
            onClick={() => setShowDrawer(false)}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </span>
            <span className="text-sm font-medium">GitHub</span>
          </a>

          {/* Dark mode toggle */}
          <button
            onClick={() => { toggleDarkMode(); setShowDrawer(false); }}
            className="w-full flex items-center gap-3 border-none shadow-none transition-colors rounded-none"
            style={{
              padding: '9px 20px',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--text-primary)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>
              {isDark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </span>
            <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* Sign Out */}
          {user && (
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 border-none shadow-none transition-colors rounded-none"
              style={{
                padding: '9px 20px',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text-primary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </span>
              <span className="text-sm font-medium">Sign Out</span>
            </button>
          )}

          {/* Sign In prompt for guest */}
          {!user && isGuestMode && (
            <button
              onClick={() => { setShowSignInPrompt(true); setShowDrawer(false); }}
              className="w-full flex items-center gap-3 border-none shadow-none transition-colors rounded-none text-blue-600"
              style={{
                padding: '9px 20px',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-medium">Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════ */}

      {/* Label Modal */}
      {(pendingBlock || editingBlock) && (
        <LabelModal
          isOpen={showLabelModal}
          startTime={editingBlock?.startTime || pendingBlock?.startTime || '00:00'}
          endTime={editingBlock?.endTime || pendingBlock?.endTime || '00:00'}
          onClose={() => {
            setShowLabelModal(false);
            setPendingBlock(null);
            setEditingBlock(null);
          }}
          onSave={handleSaveBlock}
          onDelete={editingBlock ? handleDeleteBlock : undefined}
          availableColors={availableColors}
          mode={editingBlock ? 'edit' : 'create'}
          initialLabel={editingBlock?.label}
          initialColor={editingBlock?.color}
        />
      )}

      {/* Export Preview Modal */}
      {exportPreview && (
        <ExportPreviewModal
          imageUrl={exportPreview.url}
          onClose={handleCloseExportPreview}
          onDownload={handleConfirmDownload}
        />
      )}

      {/* Authentication modal for dashboard sign-in actions */}
      {showSignInPrompt && (
        <AuthButtons
          initiallyOpen
          showNavigation={false}
          onModalClose={() => setShowSignInPrompt(false)}
        />
      )}
    </div>
  );
}
