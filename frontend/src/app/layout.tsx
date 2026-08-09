import './globals.css';
import { Providers } from '../components/Providers';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'AI Agent Workflow Builder',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-950 text-slate-100 min-h-screen antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
