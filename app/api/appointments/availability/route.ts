import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ACTIVE_STATUSES = ['confirmed', 'scheduled', 'booked'];
const DEFAULT_OPEN_HOUR = 9;
const DEFAULT_CLOSE_HOUR = 18;
const DEFAULT_SLOT_MINUTES = 30;

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function normalizeTime(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function minutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function dateOnly(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : value;
}

function dayName(date: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Karachi' }).format(new Date(`${date}T12:00:00+05:00`)).toLowerCase();
}

function parseHours(settings: any, day: string) {
  const candidates = [settings?.business_hours, settings?.opening_hours, settings?.working_hours];
  for (const candidate of candidates) {
    if (!candidate) continue;
    let hours = candidate;
    if (typeof hours === 'string') {
      try { hours = JSON.parse(hours); } catch { continue; }
    }
    if (!hours || typeof hours !== 'object') continue;
    const value = hours[day] ?? hours[day.slice(0, 3)] ?? hours[day.charAt(0).toUpperCase() + day.slice(1)];
    if (value === false || value === null) return null;
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === 'object') return [normalizeTime(first.open || first.start), normalizeTime(first.close || first.end)];
    }
    if (typeof value === 'object' && value) return [normalizeTime(value.open || value.start), normalizeTime(value.close || value.end)];
    if (typeof value === 'string') {
      const parts = value.split(/[-–—]/).map(s => normalizeTime(s.trim()));
      if (parts.length === 2) return parts;
    }
  }
  return [`${String(settings?.business_open_hour ?? DEFAULT_OPEN_HOUR).padStart(2, '0')}:00:00`, `${String(settings?.business_close_hour ?? DEFAULT_CLOSE_HOUR).padStart(2, '0')}:00:00`];
}

async function getBusinessIdFromAuth() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const { data: profile } = await auth.from('profiles').select('active_business_id').eq('id', user.id).maybeSingle();
  return profile?.active_business_id || null;
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get('business_id') || await getBusinessIdFromAuth();
  if (!businessId) return fail('Authentication or business_id is required', 401);

  const date = dateOnly(request.nextUrl.searchParams.get('date'));
  if (!date) return fail('date must use YYYY-MM-DD');
  const requestedDuration = Number(request.nextUrl.searchParams.get('duration_minutes') || DEFAULT_SLOT_MINUTES);
  const duration = Math.min(Math.max(Number.isFinite(requestedDuration) ? requestedDuration : DEFAULT_SLOT_MINUTES, 5), 240);
  const requestedStart = normalizeTime(request.nextUrl.searchParams.get('start_time'));

  const supabase = createServiceClient();
  const [{ data: settings }, { data: appointments, error }] = await Promise.all([
    supabase.from('operator_settings').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('appointments').select('id,start_time,end_time,status').eq('business_id', businessId).eq('date', date).in('status', ACTIVE_STATUSES),
  ]);
  if (error) return fail(error.message, 500);

  const hours = parseHours(settings || {}, dayName(date));
  if (!hours || !hours[0] || !hours[1]) return NextResponse.json({ ok: true, date, available: false, slots: [], reason: 'business_closed' });
  const open = minutes(hours[0]);
  const close = minutes(hours[1]);
  if (close <= open) return NextResponse.json({ ok: true, date, available: false, slots: [], reason: 'invalid_business_hours' });

  const busy = (appointments || []).map(a => ({ start: minutes(String(a.start_time).slice(0, 5)), end: minutes(String(a.end_time).slice(0, 5)) }));
  const slots: string[] = [];
  const startAt = requestedStart ? minutes(requestedStart) : open;
  const lastStart = close - duration;
  for (let start = Math.max(open, startAt); start <= lastStart; start += DEFAULT_SLOT_MINUTES) {
    const end = start + duration;
    if (busy.some(b => start < b.end && end > b.start)) continue;
    slots.push(`${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}:00`);
  }

  return NextResponse.json({ ok: true, date, day: dayName(date), business_hours: { open: hours[0], close: hours[1] }, duration_minutes: duration, requested_start: requestedStart, available: slots.length > 0, slots, busy_count: busy.length });
}
