import { SupabaseClient } from '@supabase/supabase-js';

type AppointmentIntent = {
  requestedDate: string | null;
  requestedTime: string | null;
  durationMinutes: number;
  isAppointmentIntent: boolean;
  isConfirmation: boolean;
};

const TZ = 'Asia/Karachi';
const OPEN = 9 * 60;
const CLOSE = 18 * 60;
const ACTIVE = ['confirmed', 'scheduled', 'booked'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function localDate(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+05:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
function parseTime(text: string): string | null {
  const m = text.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const mer = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (!mer && /\b(1[3-9]|2[0-3])\b/.test(m[1])) h = Number(m[1]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function parseAppointmentIntent(text: string, now = new Date()): AppointmentIntent {
  const t = text.toLowerCase().trim();
  const appointment = /\b(appointment|book|booking|slot|schedule|visit|meeting|consultation|milna|mِلنا|waqt|time)\b/i.test(t);
  const confirmation = /^(yes|yeah|yep|ok|okay|confirm|confirmed|book it|book kar do|kar dein|kr dein|haan|han|ji|jee)\b/i.test(t);
  let date: string | null = null;
  if (/\bday after tomorrow\b|\bparson\b/i.test(t)) date = addDays(localDate(now), 2);
  else if (/\btomorrow\b|\bkal\b/i.test(t)) date = addDays(localDate(now), 1);
  else if (/\btoday\b|\baaj\b|\baj\b/i.test(t)) date = localDate(now);
  else {
    const iso = t.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/);
    if (iso) date = `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  }
  return { requestedDate: date, requestedTime: parseTime(t), durationMinutes: 30, isAppointmentIntent: appointment || confirmation, isConfirmation: confirmation };
}

function overlaps(start: number, end: number, a: string, b: string) {
  const [ah, am] = a.slice(0, 5).split(':').map(Number);
  const [bh, bm] = b.slice(0, 5).split(':').map(Number);
  const s = ah * 60 + am, e = bh * 60 + bm;
  return start < e && end > s;
}

export async function getAvailableAppointmentSlots(supabase: SupabaseClient, businessId: string, date: string, durationMinutes = 30, requestedTime?: string | null) {
  const { data: rows } = await supabase.from('appointments').select('start_time,end_time,status').eq('business_id', businessId).eq('date', date).in('status', ACTIVE);
  const busy = rows || [];
  const slots: string[] = [];
  const requested = requestedTime ? Number(requestedTime.slice(0, 2)) * 60 + Number(requestedTime.slice(3, 5)) : null;
  for (let minute = OPEN; minute + durationMinutes <= CLOSE; minute += 30) {
    const end = minute + durationMinutes;
    if (busy.some((r: any) => overlaps(minute, end, r.start_time, r.end_time))) continue;
    if (requested !== null && Math.abs(minute - requested) > 120) continue;
    slots.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`);
    if (slots.length >= 5) break;
  }
  return slots;
}

export function formatSlots(date: string, slots: string[]) {
  if (!slots.length) return `Sorry, ${date} par koi slot available nahi hai. Kisi aur date ka time bata dein.`;
  const pretty = slots.map(s => { const [h, m] = s.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const hh = h % 12 || 12; return `${hh}:${pad(m)} ${ap}`; });
  return `Available slots ${date}: ${pretty.join(', ')}. In mein se konsa time book kar doon?`;
}

export async function appointmentConversationReply(supabase: SupabaseClient, businessId: string, customerId: string | null, conversationId: string, text: string) {
  const intent = parseAppointmentIntent(text);
  if (!intent.isAppointmentIntent) return null;
  const date = intent.requestedDate;
  if (!date) return `Bilkul. Appointment kis din aur kis waqt chahiye? Misal: kal 4 baje.`;
  const slots = await getAvailableAppointmentSlots(supabase, businessId, date, intent.durationMinutes, intent.requestedTime);
  if (intent.requestedTime && slots.includes(intent.requestedTime)) {
    const requested = intent.requestedTime;
    const { data: prior } = await supabase.from('messages').select('content').eq('conversation_id', conversationId).eq('sender_type', 'agent').order('created_at', { ascending: false }).limit(3);
    const alreadyOffered = (prior || []).some((m: any) => m.content?.includes(requested));
    if (!alreadyOffered) return `Ji, ${date} ko ${requested.slice(0, 2) > '12' ? Number(requested.slice(0,2))-12 || 12 : Number(requested.slice(0,2))}:${requested.slice(3)} ${Number(requested.slice(0,2)) >= 12 ? 'PM' : 'AM'} available hai. Kya main book kar doon?`;
    if (intent.isConfirmation) {
      const endMinutes = Number(requested.slice(0,2))*60 + Number(requested.slice(3)) + intent.durationMinutes;
      const end = `${pad(Math.floor(endMinutes/60))}:${pad(endMinutes%60)}:00`;
      const { data: lead } = customerId ? await supabase.from('leads').select('id,name,phone').eq('business_id', businessId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
      const { data: conflict } = await supabase.from('appointments').select('id').eq('business_id', businessId).eq('date', date).in('status', ACTIVE).lt('start_time', end).gt('end_time', `${requested}:00`).limit(1).maybeSingle();
      if (conflict) return `Ye slot abhi kisi aur ne book kar liya hai. ${formatSlots(date, await getAvailableAppointmentSlots(supabase, businessId, date, intent.durationMinutes))}`;
      const { error } = await supabase.from('appointments').insert({ business_id: businessId, customer_id: customerId, lead_id: lead?.id ?? null, customer_name: lead?.name ?? null, date, start_time: `${requested}:00`, end_time: end, status: 'confirmed', notes: 'Booked automatically from customer conversation' });
      if (error) return 'Appointment book karte waqt masla aya. Main team ko notify kar raha hoon.';
      return `Done! Aapki appointment ${date} ko ${requested.slice(0,2) > '12' ? Number(requested.slice(0,2))-12 : Number(requested.slice(0,2))}:${requested.slice(3)} ${Number(requested.slice(0,2)) >= 12 ? 'PM' : 'AM'} par confirm ho gayi hai.`;
    }
  }
  return formatSlots(date, slots);
}
