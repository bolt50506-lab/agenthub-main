export type ReplyLanguage = 'english' | 'roman_urdu' | 'urdu' | 'mixed';

export function detectReplyLanguage(text: string): ReplyLanguage {
  const value = text.trim();
  if (!value) return 'english';
  if (/\p{Arabic}/u.test(value)) return 'urdu';
  const lower = value.toLowerCase();
  const romanUrduWords = /\b(ka|ke|ki|ko|hai|hain|tha|thi|ho|aap|ap|mujhe|mujhy|mera|meri|mere|yeh|ye|woh|wo|kya|kyun|kyu|kab|kahan|kitna|kitni|chahiye|batao|bataye|karna|karo|krna|krdo|rate|qeemat|mil|sakta|sakti|sakte|aur|se|mein|main|par|pe|wala|wali|wale|nahi|nahin|haan|ji|please|plz)\b/i;
  const englishWords = /\b(the|is|are|what|which|how|when|where|can|could|would|please|price|cost|need|want|send|tell|give|for|with|and|or|your|you|we|our|this|that)\b/i;
  const roman = romanUrduWords.test(lower);
  const english = englishWords.test(lower);
  if (roman && english) return 'mixed';
  if (roman) return 'roman_urdu';
  return 'english';
}

export function buildLanguageInstruction(text: string): string {
  const language = detectReplyLanguage(text);
  if (language === 'roman_urdu') return 'Reply in Roman Urdu using Latin/English letters. Do NOT switch to English or Urdu script unless the customer does so.';
  if (language === 'urdu') return 'Reply in Urdu script. Do NOT switch to English unless the customer does so.';
  if (language === 'mixed') return 'Reply naturally in the same English + Roman Urdu mix used by the customer. Do not translate the message into English only.';
  return 'Reply in English. Do not switch to Urdu/Roman Urdu unless the customer does so.';
}
