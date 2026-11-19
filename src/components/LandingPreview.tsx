import { useEffect, useRef, useState } from 'react';
import CircularChart from './CircularChart';
import Timeline from './Timeline';
import type { TimeBlock } from '../types/schedule';
import { minutesToTimeString, timeStringToMinutes } from '../utils/timeUtils';

type BlockPlan = [startTime: string, endTime: string, label: string, color: string];
const schedule = (name: string, plan: BlockPlan[]) => ({
  name,
  blocks: plan.map(([startTime, endTime, label, color], order): TimeBlock => ({
    id: `preview-${name}-${order}`, startTime, endTime, label, color, order,
  })),
});

const schedules = [
  schedule('A weekday', [
    ['00:00', '07:00', 'Sleep', '#a78bfa'],
    ['07:30', '08:30', 'Gym', '#34d399'],
    ['09:00', '12:00', 'Work', '#60a5fa'],
    ['12:00', '13:00', 'Lunch', '#fbbf24'],
    ['13:00', '17:00', 'Work', '#60a5fa'],
    ['18:00', '19:00', 'Dinner', '#fb923c'],
    ['20:00', '21:30', 'Read', '#f472b6'],
  ]),
  schedule('A creative Saturday', [
    ['00:00', '08:00', 'Sleep', '#a78bfa'],
    ['08:30', '09:30', 'Coffee', '#fbbf24'],
    ['10:00', '12:00', 'Hike', '#65a30d'],
    ['12:30', '13:30', 'Lunch', '#fb923c'],
    ['14:00', '16:00', 'Make art', '#c084fc'],
    ['17:00', '19:00', 'Friends', '#38bdf8'],
    ['20:00', '22:00', 'Film', '#f472b6'],
  ]),
  schedule('A study day', [
    ['00:00', '07:00', 'Sleep', '#a78bfa'],
    ['07:15', '08:15', 'Run', '#34d399'],
    ['09:00', '12:00', 'Class', '#60a5fa'],
    ['12:00', '13:00', 'Lunch', '#fbbf24'],
    ['13:30', '16:30', 'Study', '#38bdf8'],
    ['18:00', '19:00', 'Cook', '#fb923c'],
    ['20:00', '21:00', 'Sketch', '#c084fc'],
  ]),
  schedule('A slow Sunday', [
    ['00:00', '08:00', 'Sleep', '#a78bfa'],
    ['08:30', '09:30', 'Breakfast', '#fbbf24'],
    ['10:00', '11:30', 'Garden', '#65a30d'],
    ['12:00', '13:00', 'Lunch', '#fb923c'],
    ['14:00', '16:00', 'Museum', '#38bdf8'],
    ['18:00', '19:00', 'Cook', '#f87171'],
    ['20:00', '22:00', 'Read', '#f472b6'],
  ]),
];

const draftColor = '#94a3b8';
const blockDurationMs = 2300;
const introDelayMs = 300;
const ignoreBlock = () => {};
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
type DemoPhase = 'waiting' | 'drawing' | 'naming' | 'color' | 'complete';
type DemoState = {
  phase: DemoPhase;
  completedCount: number;
  activeIndex: number;
  endMinutes: number;
  label: string;
  color: string;
};

const initialDemo: DemoState = {
  phase: 'waiting', completedCount: 0, activeIndex: -1, endMinutes: 5, label: '', color: draftColor,
};
const finishedDemo = (blockCount: number): DemoState => ({
  phase: 'complete', completedCount: blockCount, activeIndex: -1, endMinutes: 0, label: '', color: draftColor,
});

export default function LandingPreview() {
  const previewRef = useRef<HTMLElement>(null);
  const [hasEnteredView, setHasEnteredView] = useState(false);
  const [view, setView] = useState<'circular' | 'linear'>('circular');
  const [scheduleIndex, setScheduleIndex] = useState(0);
  const currentSchedule = schedules[scheduleIndex];
  const exampleBlocks = currentSchedule.blocks;
  const [shouldAnimate, setShouldAnimate] = useState(() => !prefersReducedMotion());
  const [demo, setDemo] = useState<DemoState>(() => prefersReducedMotion() ? finishedDemo(schedules[0].blocks.length) : initialDemo);

  useEffect(() => {
    if (!previewRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setHasEnteredView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setHasEnteredView(true);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldAnimate || !hasEnteredView) return;

    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = now - started - introDelayMs;
      if (elapsed >= exampleBlocks.length * blockDurationMs) {
        setDemo(finishedDemo(exampleBlocks.length));
        return;
      }
      if (elapsed < 0) {
        frame = requestAnimationFrame(tick);
        return;
      }

      const index = Math.floor(elapsed / blockDurationMs);
      const block = exampleBlocks[index];
      const localTime = elapsed % blockDurationMs;
      const startMinutes = timeStringToMinutes(block.startTime);
      const totalMinutes = timeStringToMinutes(block.endTime) - startMinutes;
      const drawProgress = Math.min(1, localTime / 1000);
      const drawnMinutes = Math.max(5, Math.round(totalMinutes * drawProgress / 5) * 5);
      const settling = localTime >= 2050;
      const phase: DemoPhase = settling ? 'waiting' : localTime < 1000 ? 'drawing' : localTime < 1600 ? 'naming' : 'color';
      const characters = Math.min(block.label.length, Math.ceil((localTime - 1000) / 600 * block.label.length));
      const next: DemoState = {
        phase,
        completedCount: index + (settling ? 1 : 0),
        activeIndex: settling ? -1 : index,
        endMinutes: startMinutes + drawnMinutes,
        label: localTime < 1000 ? '' : block.label.slice(0, Math.max(0, characters)),
        color: localTime >= 1850 ? block.color : draftColor,
      };
      setDemo((previous) =>
        previous.phase === next.phase &&
        previous.completedCount === next.completedCount &&
        previous.activeIndex === next.activeIndex &&
        previous.endMinutes === next.endMinutes &&
        previous.label === next.label &&
        previous.color === next.color ? previous : next
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [exampleBlocks, hasEnteredView, shouldAnimate]);

  const changeView = (nextView: 'circular' | 'linear') => {
    setView(nextView);
  };

  const replay = () => {
    const animate = !prefersReducedMotion();
    const offset = 1 + Math.floor(Math.random() * (schedules.length - 1));
    const nextIndex = (scheduleIndex + offset) % schedules.length;
    setDemo(animate ? initialDemo : finishedDemo(schedules[nextIndex].blocks.length));
    setShouldAnimate(animate);
    setScheduleIndex(nextIndex);
  };

  const activeBlock = demo.activeIndex >= 0 ? exampleBlocks[demo.activeIndex] : null;
  const shownBlocks = activeBlock
    ? [
        ...exampleBlocks.slice(0, demo.completedCount),
        { ...activeBlock, endTime: minutesToTimeString(demo.endMinutes), label: demo.label, color: demo.color },
      ]
    : exampleBlocks.slice(0, demo.completedCount);

  return (
    <figure ref={previewRef} className="mx-auto mt-20 max-w-2xl border-t border-gray-200 pt-8 sm:mt-24 dark:border-gray-800">
      <div className="flex items-center justify-between gap-4">
        <figcaption className="text-sm font-medium text-gray-600 dark:text-gray-400">{currentSchedule.name}</figcaption>
        <div className="flex items-center gap-4" role="group" aria-label="Preview view">
          <button
            type="button"
            onClick={() => changeView('circular')}
            aria-pressed={view === 'circular'}
            className={`rounded-none border-0 border-b-2 bg-transparent px-0 pb-1 pt-0 text-sm shadow-none hover:bg-transparent ${view === 'circular' ? 'border-blue-600 font-semibold text-gray-900 dark:text-white' : 'border-transparent font-normal text-gray-500 dark:text-gray-400'}`}
          >
            Circular
          </button>
          <button
            type="button"
            onClick={() => changeView('linear')}
            aria-pressed={view === 'linear'}
            className={`rounded-none border-0 border-b-2 bg-transparent px-0 pb-1 pt-0 text-sm shadow-none hover:bg-transparent ${view === 'linear' ? 'border-blue-600 font-semibold text-gray-900 dark:text-white' : 'border-transparent font-normal text-gray-500 dark:text-gray-400'}`}
          >
            Linear
          </button>
        </div>
      </div>

      <div className="relative mx-auto mt-5 flex h-[420px] max-w-lg items-center justify-center overflow-hidden">
        {view === 'circular' ? (
          <CircularChart
            timeBlocks={shownBlocks}
            onBlockCreated={ignoreBlock}
            onBlockClick={ignoreBlock}
            onBlockChanged={ignoreBlock}
            readOnly
            previewSize={340}
            previewCursorTime={demo.phase === 'drawing' ? minutesToTimeString(demo.endMinutes) : undefined}
          />
        ) : (
          <div className="flex h-full w-full overflow-hidden border border-gray-200 dark:border-gray-800">
            <Timeline
              timeBlocks={shownBlocks}
              onBlockCreated={ignoreBlock}
              onBlockClick={ignoreBlock}
              readOnly
              preview
              previewFocusTime={activeBlock?.startTime}
            />
          </div>
        )}

        {(demo.phase === 'naming' || demo.phase === 'color') && activeBlock && (
          <div className="pointer-events-none absolute bottom-3 right-2 w-44 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg sm:right-6 dark:border-gray-700 dark:bg-gray-900" aria-hidden="true">
            <div className="mb-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">Name your block</div>
            <div className="h-8 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900 dark:border-gray-600 dark:text-white">
              {demo.label}<span className="ml-0.5 inline-block h-3 w-px bg-gray-700 align-middle dark:bg-gray-200" />
            </div>
            <div className="mb-2 mt-3 text-[11px] font-medium text-gray-500 dark:text-gray-400">Color</div>
            <div className="flex gap-2">
              {[draftColor, '#60a5fa', '#34d399', activeBlock.color].filter((color, index, colors) => colors.indexOf(color) === index).map((color) => (
                <span key={color} className={`h-5 w-5 rounded-full ${demo.color === color ? 'ring-2 ring-gray-500 ring-offset-2 dark:ring-offset-gray-900' : ''}`} style={{ background: color }} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex h-9 justify-center">
        {demo.phase === 'complete' && (
          <button type="button" onClick={replay} aria-label="Replay with a new schedule" title="Replay with a new schedule" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white p-0 text-gray-600 shadow-none hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900">
            <svg width="17" height="17" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7" />
            </svg>
          </button>
        )}
      </div>
    </figure>
  );
}
