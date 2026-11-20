import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-instrument-serif',
});

export const metadata: Metadata = {
  title: 'Funnel Guardian | Autonomous Revenue Funnel Reliability',
  description:
    'Detects silent revenue-breaking bugs across signup, OAuth, onboarding, and Stripe checkout, filters noise at the Triage Gate, and ships verified PRs.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen bg-[#0C0D0F] text-[#F0F1F4] antialiased">{children}</body>
    </html>
  );
}
