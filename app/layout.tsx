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
    <html lang="en" className={`${montserrat.variable} ${sourceSans.variable}`}>
      <body>
        <div className="bg-navy-800 border-b border-white/10">
          <div className="max-w-2xl mx-auto px-4 py-1.5 flex items-center gap-2">
            <span className="text-white/40 text-xs">🎵</span>
            <span className="text-white/40 text-xs">View our club anthem on</span>
            <a
              href="https://youtu.be/7ICXK5fipOA?si=3Mkv0E1CjXSQC3QA"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-300/80 text-xs hover:text-yellow-200 underline underline-offset-2 transition-colors"
            >
              YouTube
            </a>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
