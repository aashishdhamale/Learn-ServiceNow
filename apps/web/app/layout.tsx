import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ServiceNow Architect Mastery',
  description: 'Train architect judgment with real scenarios built in your own PDI.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
