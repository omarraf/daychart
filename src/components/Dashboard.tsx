import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
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
import ChangelogPage from './ChangelogPage';
import { LATEST_CHANGELOG_ID } from '../constants/changelog';
import AppDialog from './AppDialog';
import { PanelSection } from './PanelUI';
import { LEGAL_TITLES, LegalContent, type LegalDoc } from './LegalContent';
import AuthButtons from './AuthButtons';
import AIAssistant from './AIAssistant';
import type { DisplayMessage } from './AIAssistant';
import LandingPage from './LandingPage';
import type { NavRoute, TimeBlock } from '../types/schedule';

type PanelRoute = Extract<NavRoute, 'schedules' | 'settings' | 'feedback' | 'changelog'>;
const PANEL_ROUTES: readonly NavRoute[] = ['schedules', 'settings', 'feedback', 'changelog'];
const isPanelRoute = (route: NavRoute): route is PanelRoute => PANEL_ROUTES.includes(route);
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
  // Menu panels open as popups over the chart instead of replacing it
  const [openPanel, setOpenPanel] = useState<PanelRoute | null>(null);
  // About / Terms / Privacy open inside the Settings popup rather than a second popup
  const [settingsDoc, setSettingsDoc] = useState<LegalDoc | null>(null);
  // Dot on the menu until the latest release notes have been opened
  const [hasUnseenChangelog, setHasUnseenChangelog] = useState(() => {
    try {
      return localStorage.getItem('changelogSeen') !== LATEST_CHANGELOG_ID;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (openPanel !== 'changelog' || !hasUnseenChangelog) return;
    setHasUnseenChangelog(false);
    try {
      localStorage.setItem('changelogSeen', LATEST_CHANGELOG_ID);
    } catch {
      // Storage unavailable; the dot just comes back next visit
    }
  }, [openPanel, hasUnseenChangelog]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>(null);
  const [viewMode, setViewMode] = useState<'linear' | 'circular'>('circular');
  // Plan mode is time-agnostic; Live mode adds the current-time hand and "now / next" readout
  const [liveMode, setLiveMode] = useState(() => {
    try {
      return localStorage.getItem('liveMode') === 'true';
    } catch {
      return false;
    }
  });
  const toggleLiveMode = () => {
    setLiveMode((previous) => {
      try {
        localStorage.setItem('liveMode', String(!previous));
      } catch {
        // Storage unavailable (private mode); the toggle still works for this session
      }
      return !previous;
    });
  };
  const [showBlockList, setShowBlockList] = useState(true);
  const [blockListWidth, setBlockListWidth] = useState(280);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [isResizingBlockList, setIsResizingBlockList] = useState(false);
  const resizingBlockListRef = useRef(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [activeBlock, setActiveBlock] = useState<TimeBlock | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const maxBlockListWidth = Math.max(280, Math.min(520, Math.floor(viewportWidth * 0.42), viewportWidth - 480));
  const visibleBlockListWidth = viewportWidth < 640 ? 280 : Math.min(blockListWidth, maxBlockListWidth);
  const chartLeft = showBlockList && viewportWidth >= 640 ? visibleBlockListWidth : 0;
  const clampBlockListWidth = (width: number) => Math.max(280, Math.min(maxBlockListWidth, width));

  const startBlockListResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewportWidth < 640 || !showBlockList) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingBlockListRef.current = true;
    setIsResizingBlockList(true);
    setBlockListWidth(visibleBlockListWidth);
  };

  const moveBlockListResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizingBlockListRef.current) setBlockListWidth(clampBlockListWidth(event.clientX));
  };

  const stopBlockListResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizingBlockListRef.current = false;
    setIsResizingBlockList(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const resizeBlockListWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number;
    if (event.key === 'ArrowLeft') nextWidth = visibleBlockListWidth - 20;
    else if (event.key === 'ArrowRight') nextWidth = visibleBlockListWidth + 20;
    else if (event.key === 'Home') nextWidth = 280;
    else if (event.key === 'End') nextWidth = maxBlockListWidth;
    else return;
    event.preventDefault();
    setBlockListWidth(clampBlockListWidth(nextWidth));
  };

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

  if (!user && !isGuestMode) {
    return <LandingPage onOpenPlanner={() => setIsGuestMode(true)} />;
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
    {
      route: 'changelog',
      label: "What's new",
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
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
        <div className={`absolute inset-0 flex flex-col overflow-hidden ${isResizingBlockList ? '' : 'transition-[left] duration-200'}`} style={{ paddingTop: 80, left: chartLeft }}>
          <Timeline
            timeBlocks={timeBlocks}
            onBlockCreated={handleBlockCreated}
            onBlockClick={handleBlockClick}
          />
        </div>
      )}

      {currentRoute === 'dashboard' && viewMode === 'circular' && (
        <div ref={chartContainerRef} className={`absolute inset-0 flex items-center justify-center ${isResizingBlockList ? '' : 'transition-[left] duration-200'}`} style={{ left: chartLeft, paddingTop: 40 }}>
          <CircularChart
            timeBlocks={timeBlocks}
            onBlockChanged={handleBlockChanged}
            onBlockCreated={handleBlockCreated}
            onBlockClick={handleBlockClick}
            activeBlock={activeBlock}
            sidebarOpen={showBlockList}
            sidebarWidth={visibleBlockListWidth}
            showNow={liveMode}
          />
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

      {/* ═══════════════════════════════════════════════════
          FLOATING UI — z-40
      ═══════════════════════════════════════════════════ */}

      {/* Hamburger — top-right 12px */}
      <button
        onClick={() => setShowDrawer(true)}
        className="fixed z-40 flex items-center justify-center rounded-lg transition-colors border-none p-0 shadow-sm hover:opacity-90"
        style={{
          top: 12, right: 12,
          width: 32, height: 32,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        title="Menu"
        aria-label={hasUnseenChangelog ? 'Menu, new updates' : 'Menu'}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {hasUnseenChangelog && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-600"
            style={{ boxShadow: '0 0 0 2px var(--surface)' }}
            aria-hidden="true"
          />
        )}
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

          {/* Live mode toggle — circular only */}
          {viewMode === 'circular' && (
            <>
              <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
              <button
                onClick={toggleLiveMode}
                aria-pressed={liveMode}
                className="border-none shadow-none rounded-full px-2.5 py-1 text-xs font-medium transition-colors flex items-center gap-1.5"
                style={{
                  background: liveMode ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: liveMode ? '#dc2626' : 'var(--text-muted)',
                  cursor: 'pointer',
                  height: 24,
                }}
                title={liveMode ? 'Live: showing the current time' : 'Show the current time'}
              >
                <span className="relative flex" style={{ width: 6, height: 6 }}>
                  {liveMode && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping motion-reduce:hidden" />
                  )}
                  <span
                    className="relative rounded-full"
                    style={{ width: 6, height: 6, background: liveMode ? '#ef4444' : 'var(--text-muted)', opacity: liveMode ? 1 : 0.6 }}
                  />
                </span>
                Live
              </button>
            </>
          )}

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

      {/* Schedule title — under the pill; opens the schedule switcher. Hidden while the
          block list covers the canvas on phones. */}
      {currentRoute === 'dashboard' && !(showBlockList && viewportWidth < 640) && (
        <button
          type="button"
          onClick={() => setOpenPanel('schedules')}
          className="fixed z-40 flex items-center gap-1 rounded-md border-none bg-transparent shadow-none px-2 py-0.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
          style={{
            top: 50,
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 96px)',
            color: 'var(--text-primary)',
          }}
          title="Switch schedule"
        >
          <span className="truncate">{currentScheduleName}</span>
          <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* ═══════════════════════════════════════════════════
          BLOCK LIST LEFT PANEL — z-[39] (below floating UI)
      ═══════════════════════════════════════════════════ */}

      {/* On small screens, dismiss the panel by tapping the canvas. */}
      {currentRoute === 'dashboard' && showBlockList && (
        <div
          className="fixed inset-0 z-[38] sm:hidden"
          onClick={() => setShowBlockList(false)}
        />
      )}

      {currentRoute === 'dashboard' && (
        <button
          type="button"
          onClick={() => setShowBlockList((open) => !open)}
          className={`fixed z-40 flex items-center justify-center rounded-r-lg rounded-l-none shadow-sm ${isResizingBlockList ? '' : 'transition-[left] duration-200'}`}
          style={{
            top: 72,
            left: showBlockList ? visibleBlockListWidth : 0,
            width: 32,
            height: 48,
            padding: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: 0,
            color: 'var(--text-primary)',
          }}
          aria-label={showBlockList ? 'Collapse time blocks' : 'Expand time blocks'}
          aria-expanded={showBlockList}
          aria-controls="time-block-list"
          title={showBlockList ? 'Collapse time blocks' : 'Expand time blocks'}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showBlockList ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
          </svg>
        </button>
      )}

      {/* Panel — always rendered for transition */}
      <div
        id="time-block-list"
        className="fixed top-0 left-0 h-full z-[39] flex flex-col transition-transform duration-200 ease-out"
        aria-hidden={currentRoute !== 'dashboard' || !showBlockList}
        inert={currentRoute !== 'dashboard' || !showBlockList}
        style={{
          width: visibleBlockListWidth,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          transform: currentRoute === 'dashboard' && showBlockList ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: currentRoute === 'dashboard' && showBlockList ? '8px 0 32px rgba(0,0,0,0.08)' : 'none',
          visibility: currentRoute === 'dashboard' ? 'visible' : 'hidden',
        }}
      >
        <div
          role="separator"
          aria-label="Resize time block list"
          aria-orientation="vertical"
          aria-valuemin={280}
          aria-valuemax={maxBlockListWidth}
          aria-valuenow={visibleBlockListWidth}
          tabIndex={currentRoute === 'dashboard' && showBlockList && maxBlockListWidth > 280 ? 0 : -1}
          onPointerDown={startBlockListResize}
          onPointerMove={moveBlockListResize}
          onPointerUp={stopBlockListResize}
          onPointerCancel={stopBlockListResize}
          onLostPointerCapture={stopBlockListResize}
          onKeyDown={resizeBlockListWithKeyboard}
          className={`group absolute right-0 top-0 z-10 hidden h-full w-3 translate-x-1/2 cursor-col-resize touch-none ${maxBlockListWidth > 280 ? 'sm:block' : ''}`}
          title="Drag to resize time block list"
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300 transition-colors group-hover:bg-blue-500 dark:bg-gray-600" />
        </div>
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 pb-3 pt-14 sm:pt-3"
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
        </div>

        {/* Panel list */}
        <div className="flex-1 overflow-y-auto">
          {sortedBlocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" style={{ color: 'var(--text-muted)' }}>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No time blocks yet</span>
              <span className="text-sm">Blocks you make will be listed here.</span>
            </div>
          ) : (
            sortedBlocks.map((block) => {
              const duration = calculateDuration(block.startTime, block.endTime);
              const isActive = activeBlock?.id === block.id;
              return (
                <button
                  key={block.id}
                  onClick={() => { handleBlockClick(block); }}
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
        className="fixed top-0 right-0 h-full z-[50] flex flex-col transition-transform duration-200 ease-out"
        style={{
          width: 240,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: showDrawer ? 'translateX(0)' : 'translateX(calc(100% + 2px))',
          boxShadow: showDrawer ? '-8px 0 32px rgba(0,0,0,0.1)' : 'none',
        }}
      >
        {/* Drawer header */}
        <div
          className="flex items-center gap-2.5 px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <img src="/favicon.svg" alt="" aria-hidden="true" className="h-7 w-7 flex-shrink-0" />
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
            const isActive = isPanelRoute(item.route) ? openPanel === item.route : currentRoute === item.route && !openPanel;
            return (
              <button
                key={item.route}
                onClick={() => {
                  if (isPanelRoute(item.route)) {
                    setOpenPanel(item.route);
                  } else {
                    setCurrentRoute(item.route);
                  }
                  setShowDrawer(false);
                }}
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
                {item.route === 'changelog' && hasUnseenChangelog && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-blue-600" aria-label="New updates" />
                )}
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
            href="https://github.com/omarraf/daychart"
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
          {/* Support link */}
          <a
            href="https://buymeacoffee.com/omarraf"
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
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h1a4 4 0 010 8h-1M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
              </svg>
            </span>
            <span className="text-sm font-medium"></span>
          </a>

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

      {/* Menu panels */}
      <AppDialog isOpen={openPanel === 'schedules'} onClose={() => setOpenPanel(null)} title="Your Schedules">
        {user ? (
          <SchedulesPage
            user={user}
            currentScheduleId={currentScheduleId}
            onScheduleSelect={(id) => {
              handleScheduleSelect(id);
              setOpenPanel(null);
            }}
          />
        ) : (
          <PanelSignInPrompt
            message="Create an account to save and manage multiple schedules."
            onSignIn={() => { setOpenPanel(null); setShowSignInPrompt(true); }}
          />
        )}
      </AppDialog>

      <AppDialog
        isOpen={openPanel === 'settings'}
        onClose={() => { setOpenPanel(null); setSettingsDoc(null); }}
        title={settingsDoc ? LEGAL_TITLES[settingsDoc] : 'Settings'}
      >
        {settingsDoc ? (
          <>
            <button
              type="button"
              onClick={() => setSettingsDoc(null)}
              className="mb-4 inline-flex items-center gap-1 p-0 border-none bg-transparent shadow-none text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Settings
            </button>
            <LegalContent doc={settingsDoc} />
          </>
        ) : (
          <div className="space-y-7">
            {user ? (
              <SettingsPage user={user} timeBlocks={[]} currentScheduleName="" />
            ) : (
              <PanelSignInPrompt
                message="Sign in to manage your profile and export your schedules."
                onSignIn={() => { setOpenPanel(null); setShowSignInPrompt(true); }}
              />
            )}
            <SettingsAboutSection onOpen={setSettingsDoc} />
          </div>
        )}
      </AppDialog>

      <AppDialog isOpen={openPanel === 'feedback'} onClose={() => setOpenPanel(null)} title="Share feedback">
        <FeedbackPage user={user} />
      </AppDialog>

      <AppDialog isOpen={openPanel === 'changelog'} onClose={() => setOpenPanel(null)} title="What's new">
        <ChangelogPage />
      </AppDialog>

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

function SettingsAboutSection({ onOpen }: { onOpen: (doc: LegalDoc) => void }) {
  const links: { doc: LegalDoc; label: string }[] = [
    { doc: 'about', label: 'About DayChart' },
    { doc: 'terms', label: 'Terms of Service' },
    { doc: 'privacy', label: 'Privacy Policy' },
  ];

  return (
    <PanelSection title="About">
      <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--border)' }}>
        {links.map(({ doc, label }) => (
          <button
            key={doc}
            type="button"
            onClick={() => onOpen(doc)}
            className="w-full flex items-center justify-between gap-4 rounded-none first:rounded-t-lg last:rounded-b-lg border-0 px-3 py-2.5 text-left text-sm font-normal bg-transparent shadow-none hover:bg-black/[0.03] dark:hover:bg-white/5"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {label}
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </PanelSection>
  );
}

function PanelSignInPrompt({ message, onSignIn }: { message: string; onSignIn: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="mt-0 mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
      <button
        type="button"
        onClick={onSignIn}
        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold border-none"
      >
        Sign in
      </button>
    </div>
  );
}
