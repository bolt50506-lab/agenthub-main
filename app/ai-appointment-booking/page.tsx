import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Appointment Booking for Business',
  description: 'Let customers book, reschedule and cancel appointments through AI conversations with AgentHub AI.',
  alternates: { canonical: '/ai-appointment-booking' },
};

export default function AIAppointmentBookingPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-indigo-300">AI appointment automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI appointment booking that turns customer chats into bookings</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">AgentHub AI helps businesses handle appointment requests directly inside customer conversations. Customers can move from asking a question to booking, rescheduling or cancelling without waiting for your team to respond manually.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {[
            ['Book from conversations', 'Turn customer intent into an appointment instead of sending people through a long process.'],
            ['Send reminders', 'Keep customers informed with automated appointment communication.'],
            ['Handle changes', 'Support rescheduling and cancellations as part of the same customer journey.'],
            ['Keep humans in control', 'Escalate unusual requests or sensitive situations to your team.'],
          ].map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>
        <h2 className="mt-16 text-3xl font-bold">Less back-and-forth, more booked customers</h2>
        <p className="mt-5 leading-8 text-slate-300">Appointment requests often arrive outside business hours or get delayed while staff check availability. AgentHub is designed to make the conversational part of booking faster while giving your business a clear path to human takeover when needed.</p>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Start automating appointments</Link></div>
      </article>
    </main>
  );
}
