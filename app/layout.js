import { Inter, Fira_Code } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const firaCode = Fira_Code({ variable: '--font-fira', subsets: ['latin'] });

export const metadata = {
  title: 'BPAB RW 18',
  description: 'Kelola meteran, tagihan, dan broadcast WhatsApp pelanggan air BPAB RW 18',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${inter.variable} ${firaCode.variable} h-full antialiased`}>
      <body className="flex h-full overflow-hidden">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
