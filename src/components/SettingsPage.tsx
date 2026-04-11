import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import type { Schedule } from '../types/schedule';
import { getUserSchedules } from '../services/scheduleService';
import { getBillingStatus, createCheckoutSession, openCustomerPortal } from '../services/billingService';
import type { BillingStatus } from '../services/billingService';
import { getUsage } from '../services/aiService';
import type { UsageInfo } from '../services/aiService';
import Footer from './Footer';

interface SettingsPageProps {
  user: User;
  timeBlocks: never[]; // Deprecated, keeping for compatibility
  currentScheduleName?: string; // Deprecated, keeping for compatibility
}

export default function SettingsPage({ user }: SettingsPageProps) {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [aiUsage, setAiUsage] = useState<UsageInfo | null>(null);

  // Load all schedules
  useEffect(() => {
    const loadSchedules = async () => {
      try {
        const schedules = await getUserSchedules(user.uid);
        setAllSchedules(schedules);
        if (schedules.length > 0) {
          setSelectedScheduleId(schedules[0].id);
        }
      } catch (error) {
        console.error('Error loading schedules:', error);
      }
    };
    loadSchedules();
  }, [user.uid]);

  // Load billing status and usage
  useEffect(() => {
    const loadBilling = async () => {
      try {
        const [billingData, usageData] = await Promise.all([
          getBillingStatus(),
          getUsage().catch(() => null),
        ]);
        setBilling(billingData);
        setAiUsage(usageData);
      } catch {
        // User may not have billing set up yet
      } finally {
        setBillingLoading(false);
      }
    };
    loadBilling();
  }, []);

  const selectedSchedule = allSchedules.find(s => s.id === selectedScheduleId);

  // Export as JSON
  const handleExportJSON = () => {
    if (!selectedSchedule) return;

    const exportData = {
      scheduleName: selectedSchedule.name,
      exportDate: new Date().toISOString().split('T')[0],
      timeBlocks: selectedSchedule.timeBlocks.map(({ label, startTime, endTime, color }) => ({
        label,
        startTime,
        endTime,
        color,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSchedule.name}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export as CSV
  const handleExportCSV = () => {
    if (!selectedSchedule) return;

    const headers = ['Label', 'Start Time', 'End Time', 'Duration (hours)', 'Color'];
    const rows = selectedSchedule.timeBlocks.map(block => {
      const [startHour, startMin] = block.startTime.split(':').map(Number);
      const [endHour, endMin] = block.endTime.split(':').map(Number);
      const duration = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) / 60;

      return [
        block.label,
        block.startTime,
        block.endTime,
        duration.toFixed(2),
        block.color,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSchedule.name}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export all schedules as JSON
  const handleExportAllJSON = () => {
    if (allSchedules.length === 0) return;

    const exportData = {
      exportDate: new Date().toISOString().split('T')[0],
      totalSchedules: allSchedules.length,
      schedules: allSchedules.map(schedule => ({
        name: schedule.name,
        timeBlocks: schedule.timeBlocks.map(({ label, startTime, endTime, color }) => ({
          label,
          startTime,
          endTime,
          color,
        })),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all-schedules-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Profile Section */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Profile
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                {user.email}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Created</label>
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                {user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'Unknown'}
              </div>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Subscription
          </h3>

          {billingLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          ) : !billing ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Could not load subscription info. Please try again later.</p>
          ) : (
            <div className="space-y-4">
              {/* Current Plan */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {billing?.tier === 'premium' ? 'Premium Plan' : 'Free Plan'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      billing?.tier === 'premium'
                        ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      {billing?.tier === 'premium' ? 'Active' : 'Current'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {billing?.tier === 'premium'
                      ? 'Full AI assistant access'
                      : 'Basic AI assistant access'}
                  </p>
                  {billing?.tier === 'free' && aiUsage && (
                    <div className="mt-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">AI messages used</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{aiUsage.used} / {aiUsage.limit}</span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            aiUsage.used / aiUsage.limit > 0.85 ? 'bg-red-400' :
                            aiUsage.used / aiUsage.limit > 0.6 ? 'bg-amber-400' : 'bg-blue-400'
                          }`}
                          style={{ width: `${Math.min(100, (aiUsage.used / aiUsage.limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {billing?.tier === 'premium' ? (
                <div className="space-y-3">
                  <button
                    onClick={async () => {
                      try { await openCustomerPortal(); }
                      catch { alert('Failed to open billing portal.'); }
                    }}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors flex items-center justify-between group border border-gray-200 dark:border-gray-700"
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Manage Subscription
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">Update payment, cancel, invoices</span>
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800/50 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-purple-900 dark:text-purple-200">Upgrade to Premium</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300 mt-0.5">Full AI assistant access to help plan and optimize your schedule.</p>
                      <div className="flex items-baseline gap-1 mt-2">
                        <span className="text-2xl font-bold text-purple-900 dark:text-purple-200">$5</span>
                        <span className="text-sm text-purple-600 dark:text-purple-400">/month</span>
                      </div>
                      <button
                        onClick={async () => {
                          setIsCheckingOut(true);
                          try {
                            await createCheckoutSession();
                          } catch (err) {
                            alert(err instanceof Error ? err.message : 'Failed to start checkout');
                          } finally {
                            setIsCheckingOut(false);
                          }
                        }}
                        disabled={isCheckingOut}
                        className="mt-3 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-sm hover:shadow-md disabled:opacity-50 border-none"
                      >
                        {isCheckingOut ? 'Redirecting to checkout...' : 'Upgrade Now'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Export Section */}
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Export Schedule
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select a schedule to export in different formats
          </p>

          {/* Schedule Selector */}
          {allSchedules.length > 0 ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose Schedule</label>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {allSchedules.map(schedule => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name} ({schedule.timeBlocks.length} blocks)
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleExportJSON}
                  disabled={!selectedSchedule || selectedSchedule.timeBlocks.length === 0}
                  className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between group border border-blue-100 dark:border-blue-800/40"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export as JSON
                  </span>
                  <span className="text-xs text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">Best for backup & re-import</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  disabled={!selectedSchedule || selectedSchedule.timeBlocks.length === 0}
                  className="w-full px-4 py-3 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between group border border-green-100 dark:border-green-800/40"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Export as CSV
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400 group-hover:text-green-700 dark:group-hover:text-green-300">Open in Excel/Sheets</span>
                </button>

                {/* Divider */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">or export all</span>
                  </div>
                </div>

                {/* Export All Schedules */}
                <button
                  onClick={handleExportAllJSON}
                  disabled={allSchedules.length === 0}
                  className="w-full px-4 py-3 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between group border border-purple-100 dark:border-purple-800/40"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export All Schedules
                  </span>
                  <span className="text-xs text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300">
                    {allSchedules.length} schedule{allSchedules.length !== 1 ? 's' : ''}
                  </span>
                </button>

                {selectedSchedule && selectedSchedule.timeBlocks.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    This schedule is empty. Add some time blocks before exporting.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No schedules available. Create a schedule to export.
            </p>
          )}
        </section>

      </div>
      <Footer />
    </div>
  );
}
