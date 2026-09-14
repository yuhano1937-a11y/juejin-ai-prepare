import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'W1 最小闭环 · Chat Demo' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
