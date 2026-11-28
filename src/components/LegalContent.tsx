import type { ReactNode } from 'react';

// About / Terms / Privacy copy, shared by the landing page footer and the Settings panel.

export type LegalDoc = 'about' | 'terms' | 'privacy';

export const LEGAL_TITLES: Record<LegalDoc, string> = {
  about: 'About DayChart',
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const REPO_URL = 'https://github.com/omarraf/daychart';

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold mt-0 mb-1.5" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      <div className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>{children}</div>
    </section>
  );
}

function LastUpdated() {
  return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Last updated: March 15, 2026</p>;
}

function RepoLink({ children }: { children: ReactNode }) {
  return (
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {children}
    </a>
  );
}

function AboutContent() {
  const features = [
    'Flexible circular and linear timeline views',
    'Drag to create time blocks instantly',
    'Manage multiple schedules for different purposes',
    'Export schedules as JSON or CSV',
    'Secure cloud sync across all your devices',
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
        DayChart is a free, open-source visual time tracking application. Plan your day with interactive circular and linear timelines, manage multiple schedules, and take control of your time.
      </p>

      <ul className="pl-0 list-none space-y-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="text-blue-600 dark:text-blue-400">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="pt-4 text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
        <p>
          Created by{' '}
          <a href="https://github.com/omarraf" target="_blank" rel="noopener noreferrer">@omarraf</a>
          {' · '}
          <RepoLink>View on GitHub</RepoLink>
        </p>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-5">
      <LastUpdated />
      <DocSection title="1. Acceptance of Terms">
        By accessing and using DayChart, you accept and agree to be bound by the terms and conditions of this agreement. If you do not agree to these terms, please do not use this service.
      </DocSection>
      <DocSection title="2. Use License">
        DayChart is provided free of charge for personal and commercial use. This is an open-source application, and you may use, modify, and distribute it in accordance with the project's license.
      </DocSection>
      <DocSection title="3. User Accounts">
        You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
      </DocSection>
      <DocSection title="4. Service Availability">
        We strive to provide continuous service availability but do not guarantee that DayChart will be available at all times. We reserve the right to modify or discontinue the service with or without notice.
      </DocSection>
      <DocSection title="5. Limitation of Liability">
        DayChart is provided "as is" without any warranties. We are not liable for any damages arising from your use or inability to use the service.
      </DocSection>
      <DocSection title="6. Contact">
        For questions about these Terms of Service, please contact us through the feedback form in the app menu.
      </DocSection>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-5">
      <LastUpdated />
      <DocSection title="1. Your Data is Private">
        <strong style={{ color: 'var(--text-primary)' }}>We do not access, view, or use your data.</strong> All schedules and time blocks you create are stored in your personal Firebase account and are only accessible to you.
      </DocSection>
      <DocSection title="2. Data Storage">
        Your data is stored securely in Firebase (Google's cloud infrastructure) and is protected by Firebase's security rules. Only you can access your data through your authenticated account.
      </DocSection>
      <DocSection title="3. No Data Sharing">
        We do not collect, sell, trade, or share any of your personal information or schedule data with anyone. Your information stays with you only.
      </DocSection>
      <DocSection title="4. Your Control">
        <p className="mt-0 mb-1.5">You have full control over your data:</p>
        <ul className="my-0 pl-5 list-disc space-y-1">
          <li>Export your schedules at any time (JSON or CSV)</li>
          <li>Delete your schedules whenever you want</li>
        </ul>
      </DocSection>
      <DocSection title="5. Contact">
        Questions about privacy? Reach out through the feedback form in the app menu.
      </DocSection>
    </div>
  );
}

export function LegalContent({ doc }: { doc: LegalDoc }) {
  if (doc === 'about') return <AboutContent />;
  if (doc === 'terms') return <TermsContent />;
  return <PrivacyContent />;
}
