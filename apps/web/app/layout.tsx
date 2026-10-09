import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '../components/query-provider';

export const metadata: Metadata = {
  title: 'Crypto Intelligence Terminal',
  description: 'An evidence-first crypto research workstation.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
