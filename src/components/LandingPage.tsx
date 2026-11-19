import AuthButtons from './AuthButtons';
import Footer from './Footer';
import LandingPreview from './LandingPreview';
import { isFirebaseConfigured } from '../firebase';

interface LandingPageProps {
  onOpenPlanner: () => void;
}

export default function LandingPage({ onOpenPlanner }: LandingPageProps) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white dark:bg-gray-950">
      <AuthButtons />
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-36 sm:px-8 sm:pt-44">
        <section className="mx-auto max-w-2xl text-center">
          <h1 className="m-0 text-4xl font-semibold leading-tight tracking-tight text-gray-950 sm:text-6xl dark:text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Plan your day at a glance.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-gray-600 sm:text-lg dark:text-gray-400">
            Map your time on a 24-hour dial or timeline. Add blocks as your plans take shape, and see the whole day in one place.
          </p>
          <div className="mt-8">
            <button
              onClick={onOpenPlanner}
              className="rounded-lg border-none bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-none transition-colors hover:bg-blue-700"
            >
              Open the planner
            </button>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No account needed</p>
          </div>
        </section>

        <LandingPreview />

        {!isFirebaseConfigured && (
          <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-amber-700 dark:text-amber-400">
            Sign-in and sync are currently unavailable.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
