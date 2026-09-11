import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Lead Follow-Up Automation with AI',
  description: 'Automatically follow up with leads, re-engage quiet conversations and keep sales opportunities moving with AgentHub AI.',
  alternates: { canonical: '/lead-follow-up-automation' },
};

export default function LeadFollowUpAutomationPage() {
  return (
    <main className="min-h-screen bg-[#050816] px-6 py-20 text-white">
      <article className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-cyan-300">← AgentHub AI</Link>
        <p className="mt-12 text-sm font-semibold uppercase tracking-[.2em] text-cyan-300">Sales follow-up automation</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">AI lead follow-up automation that keeps opportunities alive</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">AgentHub AI can follow up with leads after a conversation goes quiet. Build a repeatable customer journey around reminders, re-engagement and next steps instead of relying on a team member to remember every prospect.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {[
            ['Capture the lead', 'Collect the details that matter while the customer is already engaged.'],
            ['Schedule the next touch', 'Use automated follow-ups so promising conversations do not disappear.'],
            ['Use business context', 'Keep follow-up messages connected to your products, services and approved information.'],
            ['Escalate to humans', 'Let your team take over when the conversation needs a person.'],
          ].map(([title, text]) => <section key={title} className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 leading-7 text-slate-400">{text}</p></section>)}
        </div>
        <h2 className="mt-16 text-3xl font-bold">From enquiry to follow-up</h2>
        <p className="mt-5 leading-8 text-slate-300">A customer may ask for a price today and be ready to buy tomorrow. AgentHub connects the original conversation with automated follow-up, helping businesses stay present without manually maintaining a separate reminder list.</p>
        <div className="mt-10"><Link href="/#pricing" className="inline-flex rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold">Automate your follow-ups</Link></div>
      </article>
    </main>
  );
}
