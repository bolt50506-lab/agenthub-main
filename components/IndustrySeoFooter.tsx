import Link from 'next/link';

type Industry = 'pharmacies' | 'clinics' | 'real-estate' | 'restaurants' | 'ecommerce' | 'salons' | 'education';

const industries = [
  ['Pharmacies', '/ai-for-pharmacies'],
  ['Clinics', '/ai-for-clinics'],
  ['Real estate', '/ai-for-real-estate'],
  ['Restaurants', '/ai-for-restaurants'],
  ['E-commerce', '/ai-for-ecommerce'],
  ['Salons', '/ai-for-salons'],
  ['Education', '/ai-for-education'],
] as const;

const faqSets: Record<Industry, [string, string][]> = {
  pharmacies: [
    ['Can an AI agent answer pharmacy product questions on WhatsApp?', 'Yes. AgentHub AI can answer routine product and pricing enquiries using the pharmacy information and catalogue you approve.'],
    ['Can pharmacy staff control medical or prescription conversations?', 'Yes. Safe escalation rules can route prescription, clinical or uncertain questions to qualified staff instead of allowing the AI to make unsupported decisions.'],
    ['Can AgentHub AI follow up with pharmacy customers?', 'Yes. Eligible inactive enquiries can enter automated follow-up workflows so potential customers are not forgotten.'],
    ['Can a pharmacy hand a WhatsApp conversation to a human?', 'Yes. Staff can take over conversations that are sensitive, complex or outside the configured AI scope.'],
  ],
  clinics: [
    ['Can an AI agent handle clinic appointment enquiries?', 'Yes. AgentHub AI can handle routine appointment questions and guide patients through configured booking workflows.'],
    ['Can clinics use AI for patient support on WhatsApp?', 'Yes. Clinics can use approved information to answer routine service, timing and appointment questions while escalating sensitive matters.'],
    ['Can clinic staff control what the AI answers?', 'Yes. Approved business information and escalation rules can define the agent’s scope and when staff should take over.'],
    ['Can AgentHub AI follow up with patients or enquiries?', 'Yes. Eligible inactive enquiries can trigger automated follow-up workflows configured by the business.'],
  ],
  'real-estate': [
    ['Can an AI agent qualify property leads?', 'Yes. AgentHub AI can collect configured lead details, answer property enquiries from approved information and help move prospects toward the next step.'],
    ['Can real-estate businesses respond to WhatsApp enquiries 24/7?', 'Yes. The AI agent can handle routine property questions outside office hours and escalate conversations when human input is needed.'],
    ['Can AgentHub AI follow up with property prospects?', 'Yes. Inactive eligible leads can enter automated follow-up workflows to keep enquiries moving.'],
    ['Can agents take over a property conversation?', 'Yes. Human handoff can be used for negotiations, complex requirements, sensitive questions or any request outside the configured scope.'],
  ],
  restaurants: [
    ['Can an AI agent answer restaurant enquiries on WhatsApp?', 'Yes. AgentHub AI can answer approved questions about menus, services, timings and other business information.'],
    ['Can restaurants automate customer follow-up?', 'Yes. Eligible inactive enquiries can trigger configured follow-up workflows without requiring staff to manually chase every conversation.'],
    ['Can restaurant staff control the AI information?', 'Yes. Businesses can provide approved menu, pricing, service and policy information for the agent to use.'],
    ['Can a restaurant hand customers to staff?', 'Yes. Human handoff can be used whenever a request is complex, sensitive or requires staff involvement.'],
  ],
  ecommerce: [
    ['Can an AI agent answer e-commerce product questions?', 'Yes. AgentHub AI can use approved catalogue and business information to answer routine product and purchasing enquiries.'],
    ['Can AgentHub AI help recover interested shoppers?', 'Yes. Eligible inactive conversations can enter automated follow-up workflows to re-engage potential customers.'],
    ['Can e-commerce teams control product and pricing answers?', 'Yes. Businesses can configure approved information and workflow rules so the AI stays within the intended scope.'],
    ['Can shoppers be transferred to a human?', 'Yes. Human handoff can be used for complex orders, exceptions, complaints or requests that require staff.'],
  ],
  salons: [
    ['Can an AI agent handle salon appointment enquiries?', 'Yes. AgentHub AI can answer routine service and appointment questions and guide customers through configured booking workflows.'],
    ['Can salons automate WhatsApp customer support?', 'Yes. The agent can respond to routine enquiries using approved salon information and escalate conversations when needed.'],
    ['Can AgentHub AI follow up with customers who do not book?', 'Yes. Eligible inactive enquiries can trigger automated follow-up workflows to encourage customers to continue the conversation.'],
    ['Can salon staff take over a customer chat?', 'Yes. Staff can handle conversations that require personal advice, exceptions or human judgment.'],
  ],
  education: [
    ['Can an AI agent answer education enquiries?', 'Yes. AgentHub AI can answer routine questions about approved courses, services, schedules and admissions information.'],
    ['Can education businesses capture and follow up with prospective students?', 'Yes. The agent can capture enquiries and eligible inactive leads can enter automated follow-up workflows.'],
    ['Can schools or institutes control the AI information?', 'Yes. Businesses can define approved information and escalation rules so the agent stays within the intended scope.'],
    ['Can admissions staff take over conversations?', 'Yes. Human handoff can be used when a prospective student needs detailed guidance or a staff member needs to intervene.'],
  ],
};

export default function IndustrySeoFooter({ industry }: { industry: Industry }) {
  const faqs = faqSets[industry];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };

  return <>
    <section className="mx-auto mt-16 max-w-4xl">
      <h2 className="text-3xl font-bold">Frequently asked questions</h2>
      <div className="mt-6 space-y-4">
        {faqs.map(([question, answer]) => <details key={question} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><summary className="cursor-pointer font-semibold">{question}</summary><p className="mt-3 leading-7 text-slate-400">{answer}</p></details>)}
      </div>
    </section>
    <nav aria-label="AgentHub AI industries" className="mx-auto mt-14 max-w-4xl border-t border-white/10 pt-8">
      <p className="text-sm font-semibold text-slate-300">Explore AI automation by industry</p>
      <div className="mt-4 flex flex-wrap gap-3">{industries.map(([label, href]) => <Link key={href} href={href} className="rounded-full border border-white/10 px-4 py-2 text-sm text-cyan-300 hover:bg-white/5">{label}</Link>)}</div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm"><Link href="/whatsapp-ai-agent" className="text-emerald-300">WhatsApp AI Agent</Link><Link href="/ai-customer-support" className="text-violet-300">AI Customer Support</Link><Link href="/lead-follow-up-automation" className="text-cyan-300">Lead Follow-Up Automation</Link><Link href="/ai-appointment-booking" className="text-indigo-300">AI Appointment Booking</Link><Link href="/blog" className="text-slate-300">AI Automation Blog</Link></div>
    </nav>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  </>;
}
