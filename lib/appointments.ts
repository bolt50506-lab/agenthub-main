import {
  generateAIResponseWithFallback,
  type ProviderConfig,
} from './ai/providers';

/*
|--------------------------------------------------------------------------
| Appointment intent detection
|--------------------------------------------------------------------------
|
| This runs AFTER the normal reply has been generated and sent, and only
| when agent_settings.appointments_enabled is true for the business. It
| looks at the customer's message (plus the assistant's reply, for
| context) and asks the AI to extract a structured appointment ONLY if
| the customer clearly and concretely agreed to a specific date and
| time. It deliberately does not try to guess or negotiate - if the
| message is vague ("maybe next week", "sometime soon"), or only a date
| OR only a time was given, this returns null and nothing is booked.
| A fake/guessed appointment is worse than no automation at all.
|
*/

export interface DetectedAppointment {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  endTime: string; // HH:MM (24h)
  notes: string | null;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export async function detectAppointmentRequest(
  customerMessage: string,
  assistantReply: string,
  businessTimezoneHint: string,
  providerConfigs: ProviderConfig[]
): Promise<DetectedAppointment | null> {
  if (!providerConfigs.length) return null;

  const today = new Date().toISOString().slice(0, 10);

  const systemPrompt = `
You extract confirmed appointment bookings from a customer service chat.
Today's date is ${today}. Business timezone context: ${businessTimezoneHint || 'not specified, assume local time'}.

Reply with ONLY a JSON object, no other text, no markdown fences. Shape:

{
  "wants_appointment": boolean,
  "confidence": "high" | "low",
  "date": "YYYY-MM-DD" or null,
  "start_time": "HH:MM" (24h) or null,
  "end_time": "HH:MM" (24h) or null,
  "notes": string or null
}

Rules:
- "wants_appointment" is true ONLY if the customer clearly agreed to or
  requested a SPECIFIC date AND a specific time (not "sometime this week",
  not "in the morning", not "soon").
- If either the date or the time is vague, missing, or only implied,
  set wants_appointment to false and confidence to "low".
- Resolve relative dates ("tomorrow", "next Monday") against today's date.
- If no end_time was mentioned, default to 1 hour after start_time.
- Never invent a date or time that wasn't stated or clearly implied by
  the customer.
  `.trim();

  const conversationExcerpt = `Customer: ${customerMessage}\nAssistant: ${assistantReply}`;

  try {
    const response = await generateAIResponseWithFallback(
      {
        messages: [{ role: 'user', content: conversationExcerpt }],
        systemPrompt,
        temperature: 0,
        maxTokens: 300,
      },
      providerConfigs
    );

    if (response.error || !response.content?.trim()) {
      return null;
    }

    const cleaned = response.content
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '');

    const parsed = JSON.parse(cleaned) as {
      wants_appointment?: boolean;
      confidence?: string;
      date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      notes?: string | null;
    };

    if (!parsed.wants_appointment || parsed.confidence !== 'high') {
      return null;
    }

    if (!parsed.date || !parsed.start_time || !isValidDate(parsed.date) || !isValidTime(parsed.start_time)) {
      return null;
    }

    let endTime = parsed.end_time && isValidTime(parsed.end_time) ? parsed.end_time : null;

    if (!endTime) {
      const [h, m] = parsed.start_time.split(':').map(Number);
      const endHour = (h + 1) % 24;
      endTime = `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return {
      date: parsed.date,
      startTime: parsed.start_time,
      endTime,
      notes: parsed.notes || null,
    };
  } catch (error) {
    console.error('[Appointments] Detection failed:', error);
    return null;
  }
}
