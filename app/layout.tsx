import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const poppins = localFont({
  src: [
    { path: './fonts/Poppins-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/Poppins-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/Poppins-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/Poppins-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
});
export const metadata:Metadata={title:'Jobdesk — your next move',description:'Local job inbox, verified applications and job-specific resumes.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={poppins.variable}><body>{children}</body></html>;}
