import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Personal AI',
  description: 'Your personal schedule, tasks and AgastyaOne client pipeline in one place.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-body">{children}</body>
    </html>
  );
}
