'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function TrialCta() {
  const pathname = usePathname();
  if (pathname !== '/') return null;
  return <Link href="/trial" aria-label="Start 7-Day Free Demo" className="fixed bottom-5 left-5 z-[90] inline-flex items-center gap-2 rounded-full border border-white/20 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-2xl shadow-violet-950/50 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-indigo-500"><Sparkles className="h-4 w-4" />Start 7-Day Free Demo</Link>;
}
