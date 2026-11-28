import { useState } from 'react';
import AppDialog from './AppDialog';
import { LEGAL_TITLES, LegalContent, type LegalDoc } from './LegalContent';

const FOOTER_LINKS: { doc: LegalDoc; label: string }[] = [
  { doc: 'about', label: 'About' },
  { doc: 'terms', label: 'Terms' },
  { doc: 'privacy', label: 'Privacy' },
];

export default function Footer() {
  const [openDoc, setOpenDoc] = useState<LegalDoc | null>(null);

  return (
    <>
      <footer className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 py-4 px-6 text-center">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center gap-6">
            {FOOTER_LINKS.map(({ doc, label }) => (
              <span
                key={doc}
                onClick={() => setOpenDoc(doc)}
                className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </footer>

      <AppDialog isOpen={openDoc !== null} onClose={() => setOpenDoc(null)} title={openDoc ? LEGAL_TITLES[openDoc] : ''}>
        {openDoc && <LegalContent doc={openDoc} />}
      </AppDialog>
    </>
  );
}
