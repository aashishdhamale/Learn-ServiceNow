import type { Metadata } from 'next';
import { AppNav } from '@/components/app-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'ServiceNow Architect Mastery',
  description: 'Train architect judgment with realistic scenarios you build in your own PDI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppNav />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
