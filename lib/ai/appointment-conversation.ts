import { SupabaseClient } from '@supabase/supabase-js';

type Hours = { open: number; close: number; enabled: boolean };
type Intent = { appointment: boolean; confirmation: boolean; cancel: boolean; reschedule: boolean; date: string | null; time: string | null };
const DEFAULT_TZ = 'Asia/Karachi';
const ACTIVE = ['confirmed', 'scheduled', 'booked'];
const pad = (n: number) => String(n).padStart(2, '0');

function minutes(v?: string | null) {
  const m = String(v || '').slice(0, 5).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}
function localDate(now: Date, tz: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function addDays(date: string, n: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekday(date: string, tz: string) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date(`${date}T12:00:00Z`)).toLowerCase(); }
function parseTime(t: string) {
  const m = t.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje)?/i);
  if (!m) return null;
  let h = Number(m[1]), min = Number(m[2] || 0); const mer = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (mer === 'pm' && h < 12) h += 12; if (mer === 'am' && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}
function pretty(t: string) { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; }
function confirmation(t: string) { return /^(yes|yeah|yep|ok|okay|confirm|confirmed|book it|book kar do|book kardo|kar dein|kr dein|haan|han|ji|jee|theek|done)\b/i.test(t.trim()); }
function english(t: string) { return /\b(the|please|appointment|book|booking|tomorrow|today|cancel|reschedule|change|move|yes|confirm|available|time|slot)\b/i.test(t) && !/\b(kar|karo|karna|chahiye|hai|hain|mjhe|mujhe|kal|aaj|parson|baje|dein|kr)\b/i.test(t); }
function parseIntent(text: string, now = new Date(), tz = DEFAULT_TZ): Intent {
  const t = text.toLowerCase().trim();
  const appointment = /\b(appointment|book|booking|slot|schedule|scheduled|visit|meeting|consultation|milna|mِلنا|waqt|time)\b/i.test(t);
  const cancel = /\b(cancel|cancell?ation|cancelled|cancel kar|cancel kr|appointment hata|appointment khatam)\b/i.test(t);
  const reschedule = /\b(reschedule|re[- ]?schedule|change.*appointment|move.*appointment|shift.*appointment|appointment.*change|appointment.*move|time.*change|date.*change|aglay din|dusre din)\b/i.test(t);
  let date: string | null = null;
  if (/\bday after tomorrow\b|\bparson\b/i.test(t)) date = addDays(localDate(now, tz), 2);
  else if (/\btomorrow\b|\bkal\b/i.test(t)) date = addDays(localDate(now, tz), 1);
  else if (/\btoday\b|\baaj\b|\baj\b/i.test(t)) date = localDate(now, tz);
  else { const m = t.match(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/); if (m) date = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`; }
  return { appointment: appointment || cancel || reschedule || confirmation(t), confirmation: confirmation(t), cancel, reschedule, date, time: parseTime(t) };
}
async function schedule(s: SupabaseClient, businessId: string, date: string) {
  const { data } = await s.from('businesses').select('timezone,working_hours,appointment_duration').eq('id', businessId).maybeSingle();
  const row = data ?? {};
  const timezone = row.timezone || DEFAULT_TZ;
  const raw = row.working_hours as Record<string, { open?: string; close?: string; enabled?: boolean }> | null;
  const d = raw?.[weekday(date, timezone)];
  return { timezone, duration: Number(row.appointment_duration) > 0 ? Number(row.appointment_duration) : 30, hours: { open: minutes(d?.open) ?? 540, close: minutes(d?.close) ?? 1080, enabled: d?.enabled !== false } as Hours };
}
async function available(s: SupabaseClient, bid: string, date: string, requested?: string | null) {
  const cfg = await schedule(s, bid, date); const busyQ = await s.from('appointments').select('start_time,end_time').eq('business_id', bid).eq('date', date).in('status', ACTIVE);
  if (!cfg.hours.enabled || cfg.hours.close <= cfg.hours.open) return [];
  const busy = busyQ.data || []; const wanted = minutes(requested); const out: string[] = [];
  for (let x = cfg.hours.open; x + cfg.duration <= cfg.hours.close; x += 30) {
    if (wanted !== null && Math.abs(x - wanted) > 120) continue;
    const end = x + cfg.duration;
    if (busy.some((r: any) => { const a = minutes(r.start_time) ?? 0, b = minutes(r.end_time) ?? 0; return x < b && end > a; })) continue;
    out.push(`${pad(Math.floor(x / 60))}:${pad(x % 60)}`); if (out.length >= 5) break;
  }
  return out;
}
function slotsText(date: string, slots: string[], en: boolean) { if (!slots.length) return en ? `Sorry, there are no available slots on ${date}. Please choose another date.` : `Sorry, ${date} par koi slot available nahi hai. Kisi aur date ka time bata dein.`; return en ? `Available slots on ${date}: ${slots.map(pretty).join(', ')}. Which time would you like?` : `Available slots ${date}: ${slots.map(pretty).join(', ')}. In mein se konsa time book kar doon?`; }
async function pending(s: SupabaseClient, conversationId: string, intent: Intent) {
  if (!intent.confirmation) return intent;
  const { data } = await s.from('messages').select('content,created_at').eq('conversation_id', conversationId).eq('sender_type', 'agent').order('created_at', { ascending: false }).limit(8);
  const offered = (data || []).map((x: any) => x.content || '').find((x: string) => /available|book kar|book.*time|which time|konsa time/i.test(x));
  if (!offered) return intent;
  const dm = offered.match(/\b(20\d{2}-\d{2}-\d{2})\b/); const tm = offered.match(/\b(\d{1,2}:\d{2})\s*(AM|PM)\b/i);
  let time = intent.time; if (!time && tm) { let h = Number(tm[1].split(':')[0]); const m = Number(tm[1].split(':')[1]); if (tm[2].toUpperCase() === 'PM' && h < 12) h += 12; if (tm[2].toUpperCase() === 'AM' && h === 12) h = 0; time = `${pad(h)}:${pad(m)}`; }
  return { ...intent, date: intent.date || dm?.[1] || null, time };
}
async function customerAppointment(s: SupabaseClient, bid: string, customerId: string | null) {
  if (!customerId) return null;
  return (await s.from('appointments').select('id,lead_id,customer_name,date,start_time,end_time,status,service_name').eq('business_id', bid).eq('customer_id', customerId).in('status', ACTIVE).order('date', { ascending: true }).order('start_time', { ascending: true }).limit(1).maybeSingle()).data;
}
export async function appointmentConversationReply(s: SupabaseClient, bid: string, customerId: string | null, conversationId: string, text: string) {
  const cfg0 = await schedule(s, bid, localDate(new Date(), DEFAULT_TZ));
  let intent = parseIntent(text, new Date(), cfg0.timezone); if (!intent.appointment) return null;
  const en = english(text); intent = await pending(s, conversationId, intent);
  const active = await customerAppointment(s, bid, customerId);
  if (intent.cancel) {
    if (!active) return en ? 'I could not find an active appointment for you.' : 'Aapki koi active appointment nahi mili.';
    const { error } = await s.from('appointments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', active.id).eq('business_id', bid).in('status', ACTIVE);
    if (error) { console.error('[Appointment AI] cancel failed', error); return en ? 'I could not cancel the appointment right now. Please try again.' : 'Appointment cancel karte waqt masla aya. Dobara try karein.'; }
    return en ? `Done. Your appointment on ${active.date} at ${pretty(active.start_time.slice(0,5))} has been cancelled.` : `Done! Aapki ${active.date} ko ${pretty(active.start_time.slice(0,5))} wali appointment cancel ho gayi hai.`;
  }
  if (intent.reschedule) {
    if (!active) return en ? 'I could not find an active appointment to reschedule.' : 'Reschedule karne ke liye koi active appointment nahi mili.';
    if (!intent.date && !intent.time) return en ? `Your current appointment is ${active.date} at ${pretty(active.start_time.slice(0,5))}. What new date and time would you like?` : `Aapki current appointment ${active.date} ko ${pretty(active.start_time.slice(0,5))} hai. Nayi date aur time bata dein.`;
    const date = intent.date || active.date; const time = intent.time;
    if (!time) return slotsText(date, await available(s, bid, date), en);
    const cfg = await schedule(s, bid, date); if (!cfg.hours.enabled) return en ? `The business is closed on ${weekday(date, cfg.timezone)}. Please choose another day.` : `${weekday(date, cfg.timezone)} ko business band hai. Kisi aur din ka time bata dein.`;
    const slots = await available(s, bid, date, time);
    if (!slots.includes(time)) return en ? `${pretty(time)} is not available on ${date}. ${slotsText(date, slots, true)}` : `${pretty(time)} ${date} ko available nahi hai. ${slotsText(date, slots, false)}`;
    if (!intent.confirmation) return en ? `${date} at ${pretty(time)} is available. Shall I move your appointment there?` : `${date} ko ${pretty(time)} available hai. Kya main appointment is time par shift kar doon?`;
    const start = minutes(time)!; const end = start + cfg.duration; const endTime = `${pad(Math.floor(end / 60))}:${pad(end % 60)}:00`;
    const conflict = await s.from('appointments').select('id').eq('business_id', bid).eq('date', date).in('status', ACTIVE).lt('start_time', endTime).gt('end_time', `${time}:00`).neq('id', active.id).limit(1).maybeSingle();
    if (conflict.data) return en ? `That slot was just taken. ${slotsText(date, await available(s, bid, date), true)}` : `Ye slot abhi book ho gaya hai. ${slotsText(date, await available(s, bid, date), false)}`;
    const { error } = await s.from('appointments').update({ date, start_time: `${time}:00`, end_time: endTime, status: 'confirmed', updated_at: new Date().toISOString(), notes: 'Rescheduled automatically from customer conversation' }).eq('id', active.id).eq('business_id', bid).in('status', ACTIVE);
    if (error) { console.error('[Appointment AI] reschedule failed', error); return en ? 'I could not reschedule the appointment right now.' : 'Appointment reschedule karte waqt masla aya.'; }
    return en ? `Done! Your appointment has been moved to ${date} at ${pretty(time)}.` : `Done! Aapki appointment ${date} ko ${pretty(time)} par shift ho gayi hai.`;
  }
  if (intent.confirmation && !intent.date && !intent.time) return en ? 'Sure. What date and time should I confirm?' : 'Ji bilkul. Kis din aur kis waqt appointment confirm karni hai?';
  if (!intent.date) return en ? 'Sure. What date and time would you like? For example: tomorrow at 4 PM.' : 'Bilkul. Appointment kis din aur kis waqt chahiye? Misal: kal 4 baje.';
  const cfg = await schedule(s, bid, intent.date);
  if (!cfg.hours.enabled) return en ? `The business is closed on ${weekday(intent.date, cfg.timezone)}. Please choose another day.` : `${weekday(intent.date, cfg.timezone)} ko business band hai. Kisi aur din ka time bata dein.`;
  const slots = await available(s, bid, intent.date, intent.time);
  if (intent.time && slots.includes(intent.time)) {
    if (!intent.confirmation) return en ? `${intent.date} at ${pretty(intent.time)} is available. Shall I book it?` : `Ji, ${intent.date} ko ${pretty(intent.time)} available hai. Kya main book kar doon?`;
    const start = minutes(intent.time)!; const end = start + cfg.duration; if (end > cfg.hours.close) return slotsText(intent.date, slots, en);
    const endTime = `${pad(Math.floor(end / 60))}:${pad(end % 60)}:00`;
    const existing = customerId ? await s.from('appointments').select('id').eq('business_id', bid).eq('customer_id', customerId).eq('date', intent.date).eq('start_time', `${intent.time}:00`).in('status', ACTIVE).limit(1).maybeSingle() : { data: null };
    if (existing.data) return en ? `Your appointment on ${intent.date} at ${pretty(intent.time)} is already confirmed.` : `Aapki appointment ${intent.date} ko ${pretty(intent.time)} par already confirm hai.`;
    const conflict = await s.from('appointments').select('id').eq('business_id', bid).eq('date', intent.date).in('status', ACTIVE).lt('start_time', endTime).gt('end_time', `${intent.time}:00`).limit(1).maybeSingle();
    if (conflict.data) return slotsText(intent.date, await available(s, bid, intent.date), en);
    const lead = customerId ? (await s.from('leads').select('id,name').eq('business_id', bid).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data : null;
    const { error } = await s.from('appointments').insert({ business_id: bid, customer_id: customerId, lead_id: lead?.id || null, customer_name: lead?.name || null, date: intent.date, start_time: `${intent.time}:00`, end_time: endTime, status: 'confirmed', notes: 'Booked automatically from customer conversation' });
    if (error) { console.error('[Appointment AI] booking failed', error); return en ? 'I could not book the appointment right now. Our team has been notified.' : 'Appointment book karte waqt masla aya. Team ko notify kar diya hai.'; }
    return en ? `Done! Your appointment is confirmed for ${intent.date} at ${pretty(intent.time)}.` : `Done! Aapki appointment ${intent.date} ko ${pretty(intent.time)} par confirm ho gayi hai.`;
  }
  if (intent.time) return en ? `Sorry, ${pretty(intent.time)} is not available on ${intent.date}. ${slotsText(intent.date, slots, true)}` : `Sorry, ${pretty(intent.time)} ${intent.date} ko available nahi hai. ${slotsText(intent.date, slots, false)}`;
  return slotsText(intent.date, slots, en);
}
