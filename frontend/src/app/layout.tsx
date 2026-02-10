import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Infinize Trans – Real-time Multilingual Video Meeting',
  description:
    'Browser-based video meetings with real-time two-way multilingual translation powered by AWS.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-white">{children}</body>
    </html>
  );
}
