import type { Metadata, Viewport } from 'next';
import './globals.css';
import QueryProvider from '@/providers/QueryProvider';

export const metadata: Metadata = {
  title: 'Bank Nifty Dashboard',
  description: 'Live Bank Nifty trading dashboard — weightage, signals, and admin notes',
  robots: 'noindex, nofollow', // Internal tool — keep off search engines
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0f1117] text-slate-200 antialiased">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
