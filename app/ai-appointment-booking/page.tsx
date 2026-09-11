import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Appointment Booking for Businesses | WhatsApp Automation',
  description: 'Let customers book, reschedule and cancel appointments through AI conversations on WhatsApp and website chat with AgentHub AI.',
  alternates: { canonical: '/ai-appointment-booking' },
};

const features = [
  ['Book from conversations', 'Turn customer intent into an appointment request without forcing customers through a long process.'],
  ['Collect booking details', 'Ask for the information your workflow requires, such as service, preferred date, time and customer contact details.'],
  ['Send reminders', 'Keep customers informed with automated appointment communication and follow-up.'],
  ['Reschedule or cancel', 'Handle common appointment changes within the same customer conversation.'],
  ['Recover missed opportunities', 'Reconnect with customers who asked about booking but did not complete the next step.'],
  ['Human takeover', 'Escalate unusual requests, availability questions or cases that need staff attention.'],
];

const steps = [
  ['Customer asks', 'A customer starts a WhatsApp or website conversation and asks about a service, price or available appointment.'],
  ['Agent qualifies', 'The AI collects the configured booking details and answers routine questions using approved business information.'],
  ['Booking action', 'The customer is guided toward the configured appointment action once the required information is available.'],
  ['Reminder and follow-up', 'Automated reminders help customers remember appointments, while eligible leads can receive follow-up if they stop before booking.'],
];

const industries = [
  ['Clinics', '/ai-for-clinics', 'Manage appointment enquiries while leaving clinical decisions and sensitive exceptions to qualified staff.'],
  ['Salons', '/ai-for-salons', 'Help customers choose services, share availability and move from enquiry to booking.'],
  ['Restaurants', '/ai-for-restaurants', 'Handle reservation-style enquiries and customer questions before staff need to intervene.'],
  ['Education', '/ai-for-education', 'Capture enquiries for classes, academies and educational services and guide prospects toward the next step.'],
];

const faqs = [
  ['Can customers book through WhatsApp?', 'Yes. AgentHub can guide customers through a conversational booking workflow on WhatsApp when the relevant business integration and booking process are configured.'],
  ['Can the agent handle rescheduling?', 'Common rescheduling and cancellation requests can be handled as part of the configured workflow, with human takeover available for exceptions.'],
  ['What information can the agent collect?', 'The workflow can ask for details such as the requested service, preferred date and time, and customer contact information needed by the business.'],
  ['Can appointment leads be followed up?', 'Yes. Appointment enquiries can connect to follow-up automation so customers who do not complete the next step can be re-engaged according to the configured rules.'],
];

export default function AIAppointmentBookingPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-indigo-300">AI appointment automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI appointment booking that turns customer chats into bookings</h1>
        <p className="mt-6 max-w-4xl text-lg leading-8 text-slate-300">Appointment enquiries often arrive when staff are busy or outside business hours. AgentHub AI helps businesses move customers from questions to booking, reminders, rescheduling and follow-up through conversational automation on WhatsApp and website chat.</p>

        <h2 className="mt-16 text-3xl font-bold">What an AI appointment agent can handle</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {features.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">A conversational booking workflow</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {steps.map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>

        <section className="mt-16 rounded-3xl border border-indigo-400/20 bg-indigo-400/[.04] p-8">
          <h2 className="text-3xl font-bold">Why conversational booking matters</h2>
          <p className="mt-4 leading-8 text-slate-300">Customers do not always know exactly which service they need or which booking details to provide. A conversational agent can answer routine questions first, collect the required information and then guide the customer to the configured booking step. This reduces unnecessary back-and-forth while keeping staff available for requests that genuinely need a person.</p>
        </section>

        <h2 className="mt-16 text-3xl font-bold">Where appointment automation fits</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {industries.map(([title, href, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-xl font-semibold">{title}</h3><p className="mt-3 leading-7 text-slate-400">{text}</p><Link href={href} className="mt-4 inline-block text-cyan-300">Explore AI for {title.toLowerCase()} →</Link></section>)}
        </div>

        <h2 className="mt-16 text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-8 space-y-4">
          {faqs.map(([question, answer]) => <section key={question} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h3 className="text-lg font-semibold">{question}</h3><p className="mt-3 leading-7 text-slate-400">{answer}</p></section>)}
        </div>

        <h2 className="mt-16 text-2xl font-bold">Explore related automation</h2>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/ai-customer-support" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI customer support</Link>
          <Link href="/lead-follow-up-automation" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">Lead follow-up automation</Link>
          <Link href="/whatsapp-ai-agent" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">WhatsApp AI agent</Link>
          <Link href="/blog/ai-appointment-booking" className="rounded-xl border border-white/10 px-4 py-2 text-cyan-300">AI appointment booking guide</Link>
        </div>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Start automating appointments</Link></div>
      </article>
    </main>
  );
}
