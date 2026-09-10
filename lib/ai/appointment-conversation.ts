import { SupabaseClient } from '@supabase/supabase-js';

type AppointmentIntent = {
  requestedDate: string | null;
  requestedTime: string | null;
  durationMinutes: number;
  isAppointmentIntent: boolean;
  isConfirmation: boolean;
};

type Hours = { open: number; close: number; enabled: boolean };
const DEFAULT_TZ = 'Asia/Karachi';
const DEFAULT_OPEN = 9 * 60;
const DEFAULT_CLOSE = 18 * 60;
const ACTIVE = ['confirmed', 'scheduled', 'booked'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function parseMinutes(value: string | undefined) {
  if (!value) return null;
  const m = value.slice(0, 5).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function localDate(d: Date, timezone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00+05:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayName(date: string, timezone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long' }).format(new Date(`${date}T12:00:00+05:00`)).toLowerCase();
}
function parseTime(text: string): string | null {
  const m = text.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|baje)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const mer = (m[3] || '').toLowerCase().replace(/\./g, '');
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (!mer && h >= 13 && h <= 23) h = Number(m[1]);
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}
function isConfirmation(text: string) {
  return /^(yes|yeah|yep|ok|okay|confirm|confirmed|book it|book kar do|book kardo|kar dein|kr dein|haan|han|ji|jee|theek|done)\b/i.test(text.trim());
}
export function parseAppointmentIntent(text: string, now = new Date()): AppointmentIntent {
  const t = text.toLowerCase().trim();
  const appointment = /\b(appointment|book|booking|slot|schedule|scheduled|visit|meeting|consultation|milna|mِلنا|waqt|time)\b/i.test(t);
  const confirmation = isConfirmation(t);
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
  const aStart = parseMinutes(a) ?? 0;
  const bEnd = parseMinutes(b) ?? 0;
  return start < bEnd && end > aStart;
}
async function getBusinessSchedule(supabase: SupabaseClient, businessId: string, date: string) {
  const { data } = await supabase.from('businesses').select('timezone,working_hours,appointment_duration').eq('id', businessId).maybeSingle();
  const timezone = data?.timezone || DEFAULT_TZ;
  const raw = data?.working_hours as Record<string, { open?: string; close?: string; enabled?: boolean }> | null;
  const day = dayName(date, timezone);
  const configured = raw?.[day];
  const open = parseMinutes(configured?.open) ?? DEFAULT_OPEN;
  const close = parseMinutes(configured?.close) ?? DEFAULT_CLOSE;
  return { timezone, durationMinutes: Number(data?.appointment_duration) > 0 ? Number(data.appointment_duration) : 30, hours: { open, close, enabled: configured?.enabled !== false } as Hours, hasConfiguredDay: !!configured };
}
export async function getAvailableAppointmentSlots(supabase: SupabaseClient, businessId: string, date: string, durationMinutes?: number, requestedTime?: string | null) {
  const schedule = await getBusinessSchedule(supabase, businessId, date);
  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : schedule.durationMinutes;
  if (!schedule.hours.enabled || schedule.hours.close <= schedule.hours.open || schedule.hours.open + duration > schedule.hours.close) return [];
  const { data: rows } = await supabase.from('appointments').select('start_time,end_time,status').eq('business_id', businessId).eq('date', date).in('status', ACTIVE);
  const busy = rows || [];
  const slots: string[] = [];
  const requested = requestedTime ? parseMinutes(requestedTime) : null;
  for (let minute = schedule.hours.open; minute + duration <= schedule.hours.close; minute += 30) {
    const end = minute + duration;
    if (busy.some((r: { start_time: string; end_time: string }) => overlaps(minute, end, r.start_time, r.end_time))) continue;
    if (requested !== null && Math.abs(minute - requested) > 120) continue;
    slots.push(`${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`);
    if (slots.length >= 5) break;
  }
  return slots;
}
function prettyTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function formatSlots(date: string, slots: string[]) {
  if (!slots.length) return `Sorry, ${date} par koi slot available nahi hai. Kisi aur date ka time bata dein.`;
  return `Available slots ${date}: ${slots.map(prettyTime).join(', ')}. In mein se konsa time book kar doon?`;
}
async function recoverPendingSelection(supabase: SupabaseClient, conversationId: string, intent: AppointmentIntent) {
  if (!intent.isConfirmation) return intent;
  const { data: prior } = await supabase.from('messages').select('sender_type,content').eq('conversation_id', conversationId).eq('sender_type', 'agent').order('created_at', { ascending: false }).limit(5);
  const offered = (prior || []).map((m: { content?: string }) => m.content || '').find((content) => /available hai|available slots|kya main book kar doon/i.test(content));
  if (!offered) return intent;
  const dateMatch = offered.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const timeMatch = offered.match(/\b(\d{1,2}:\d{2})\s*(AM|PM)\b/i);
  let recoveredTime = intent.requestedTime;
  if (!recoveredTime && timeMatch) {
    let h = Number(timeMatch[1].split(':')[0]);
    const min = Number(timeMatch[1].split(':')[1]);
    if (timeMatch[2].toUpperCase() === 'PM' && h < 12) h += 12;
    if (timeMatch[2].toUpperCase() === 'AM' && h === 12) h = 0;
    recoveredTime = `${pad(h)}:${pad(min)}`;
  }
  return { ...intent, requestedDate: intent.requestedDate || dateMatch?.[1] || null, requestedTime: recoveredTime };
}
export async function appointmentConversationReply(supabase: SupabaseClient, businessId: string, customerId: string | null, conversationId: string, text: string) {
  let intent = parseAppointmentIntent(text);
  if (!intent.isAppointmentIntent) return null;
  intent = await recoverPendingSelection(supabase, conversationId, intent);
  if (intent.isConfirmation && (!intent.requestedDate || !intent.requestedTime)) return 'Ji bilkul. Kis din aur kis waqt appointment confirm karni hai?';
  if (!intent.requestedDate) return 'Bilkul. Appointment kis din aur kis waqt chahiye? Misal: kal 4 baje.';
  const schedule = await getBusinessSchedule(supabase, businessId, intent.requestedDate);
  if (!schedule.hours.enabled) return `Sorry, ${dayName(intent.requestedDate, schedule.timezone)} ko business band hai. Kisi aur din ka time bata dein.`;
  const slots = await getAvailableAppointmentSlots(supabase, businessId, intent.requestedDate, schedule.durationMinutes, intent.requestedTime);
  if (intent.requestedTime && slots.includes(intent.requestedTime)) {
    const start = intent.requestedTime;
    if (!intent.isConfirmation) return `Ji, ${intent.requestedDate} ko ${prettyTime(start)} available hai. Kya main book kar doon?`;
    const startMinutes = parseMinutes(start) ?? 0;
    const endMinutes = startMinutes + schedule.durationMinutes;
    if (endMinutes > schedule.hours.close) return formatSlots(intent.requestedDate, slots);
    const end = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}:00`;
    const { data: lead } = customerId ? await supabase.from('leads').select('id,name,phone').eq('business_id', businessId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1).maybeSingle() : { data: null };
    const { data: existingBooking } = await supabase.from('appointments').select('id').eq('business_id', businessId).eq('customer_id', customerId).eq('date', intent.requestedDate).eq('start_time', `${start}:00`).in('status', ACTIVE).limit(1).maybeSingle();
    if (existingBooking) return `Aapki appointment ${intent.requestedDate} ko ${prettyTime(start)} par already confirm hai.`;
    const { data: conflict } = await supabase.from('appointments').select('id').eq('business_id', businessId).eq('date', intent.requestedDate).in('status', ACTIVE).lt('start_time', end).gt('end_time', `${start}:00`).limit(1).maybeSingle();
    if (conflict) return `Ye slot abhi kisi aur ne book kar liya hai. ${formatSlots(intent.requestedDate, await getAvailableAppointmentSlots(supabase, businessId, intent.requestedDate, schedule.durationMinutes))}`;
    const { error } = await supabase.from('appointments').insert({ business_id: businessId, customer_id: customerId, lead_id: lead?.id ?? null, customer_name: lead?.name ?? null, date: intent.requestedDate, start_time: `${start}:00`, end_time: end, status: 'confirmed', notes: 'Booked automatically from customer conversation' });
    if (error) { console.error('[Appointment AI] booking failed', error); return 'Appointment book karte waqt masla aya. Main team ko notify kar raha hoon.'; }
    return `Done! Aapki appointment ${intent.requestedDate} ko ${prettyTime(start)} par confirm ho gayi hai.`;
  }
  if (intent.requestedTime) return `Sorry, ${intent.requestedDate} ko ${prettyTime(intent.requestedTime)} available nahi hai. ${formatSlots(intent.requestedDate, slots)}`;
  return formatSlots(intent.requestedDate, slots);
}