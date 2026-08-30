import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ARIA — Skylark Drones Business Intelligence Agent',
  description:
    'AI-powered business intelligence for Skylark Drones. Query work orders, deals pipeline, sector performance, and operational metrics through natural language.',
  keywords: ['business intelligence', 'drone services', 'monday.com', 'AI agent', 'pipeline analytics'],
  authors: [{ name: 'Skylark Drones' }],
  openGraph: {
    title: 'ARIA — Skylark BI Agent',
    description: 'Executive-grade BI powered by AI and Monday.com',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>{children}</body>
    </html>
  );
}
