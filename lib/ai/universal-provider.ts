import {
  generateAIResponseWithFallback as generateBaseAIResponseWithFallback,
  type AIRequest,
  type AIResponse,
  type ProviderConfig,
} from './providers';
import { buildLanguageInstruction, detectReplyLanguage } from './language';

export type { AIMessage, AIRequest, AIResponse, AIProvider, ProviderConfig } from './providers';
export { generateAIResponse, getAIProvider } from './providers';

function getLatestCustomerText(request: AIRequest): string {
  const messages = request.messages || [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user' && messages[index]?.content?.trim()) return messages[index].content.trim();
  }
  return '';
}

function buildUniversalBehavior(request: AIRequest): string {
  const customerText = getLatestCustomerText(request);
  const detected = customerText ? detectReplyLanguage(customerText) : 'english';
  const language = customerText ? buildLanguageInstruction(customerText) : 'Reply in the configured customer language.';

  return `
UNIVERSAL AGENT BEHAVIOR — APPLY ON EVERY CHANNEL
- You are the same business agent whether this message arrived from WhatsApp, Facebook Messenger, Instagram, or the website chat.
- Follow the business, agent, products/services, knowledge and policy context already supplied by the channel.
- Never invent products, services, prices, availability, policies, bookings, payments, approvals or completed actions.
- Use the customer's actual conversation history. Do not restart with a generic greeting when the conversation is already active.
- SALES INTELLIGENCE: For genuine prospects, explain relevant benefits and value, handle a reasonable objection once, and guide the customer toward the next useful step without pressure.
- LEAD CAPTURE: Naturally collect missing contact or requirement details when they are useful. Never repeatedly ask for details already known.
- FOLLOW-UP: Respect explicit future-intent statements such as “later”, “tomorrow”, or “next week” so the follow-up system can re-engage the lead. Never claim a follow-up was scheduled unless the application actually scheduled it.
- HUMAN HANDOVER: If the customer asks for a human or raises a serious complaint, be calm and cooperative. Do not argue with the customer or pretend a human has already replied.
- PAYMENT/RECEIPTS: Only describe a payment as successful after the platform has actually confirmed it. Never claim a receipt was sent unless the channel delivery system confirmed it.
- LANGUAGE OVERRIDE: The customer's current language takes priority over the dashboard default. ${language}
- Detected customer language: ${detected}
- Roman Urdu means Latin/English letters for Urdu. Do not silently translate Roman Urdu into English-only. If the customer uses Urdu script, answer in Urdu script. If English, answer in English. If mixed, naturally preserve the mix.
- Keep the answer natural for the current channel and avoid unnecessary long explanations.
`.trim();
}

export async function generateAIResponseWithFallback(
  request: AIRequest,
  providerConfigs: ProviderConfig[]
): Promise<AIResponse> {
  const universalPrompt = buildUniversalBehavior(request);
  const systemPrompt = request.systemPrompt?.trim()
    ? `${request.systemPrompt.trim()}\n\n${universalPrompt}`
    : universalPrompt;

  return generateBaseAIResponseWithFallback(
    { ...request, systemPrompt },
    providerConfigs
  );
}
