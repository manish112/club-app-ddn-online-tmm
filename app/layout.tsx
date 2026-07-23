import type { Metadata, Viewport } from 'next';
import { Montserrat, Source_Sans_3 } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  weight: ['300', '400', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Dehradun Online Toastmasters — Meeting Roles',
  description: 'Claim and view meeting roles for Dehradun Online Toastmasters Club · Club No. 03295206 · District 41',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${sourceSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s=localStorage.getItem('theme'),p=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s!=='light'&&p)){document.documentElement.classList.add('dark');}})();` }} />
      </head>
      <body>
        <a
          href="https://youtu.be/7ICXK5fipOA?si=3Mkv0E1CjXSQC3QA"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group sticky top-0 z-50 h-9"
        >
          <div className="max-w-2xl mx-auto px-4 w-full flex items-center justify-between gap-3">
            {/* Left: animated bars + song info */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-end gap-[2.5px] h-[14px] shrink-0">
                {[12, 8, 14, 6, 10].map((h, i) => (
                  <span
                    key={i}
                    className="w-[2.5px] rounded-full bg-maroon-600 dark:bg-maroon-400 animate-bounce"
                    style={{ height: `${h}px`, animationDelay: `${i * 0.12}s`, animationDuration: '0.85s' }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-widest text-maroon-600 dark:text-maroon-400 shrink-0 bg-maroon-50 dark:bg-maroon-900/30 px-1.5 py-0.5 rounded">
                  Club Anthem
                </span>
                <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                  Rise and Speak
                </span>
                <span className="text-slate-300 dark:text-slate-600 text-[10px] shrink-0">|</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                  Dehradun Toastmasters Club
                </span>
              </div>
            </div>
            {/* Right: YouTube CTA */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 group-hover:text-maroon-600 dark:group-hover:text-maroon-400 transition-colors">
                Listen on YouTube
              </span>
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-slate-400 dark:text-slate-500 group-hover:text-maroon-600 dark:group-hover:text-maroon-400 group-hover:translate-x-0.5 transition-all" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </a>
        {children}
      </body>
    </html>
  );
}
