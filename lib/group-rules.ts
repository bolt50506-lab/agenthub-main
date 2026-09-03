import type { GroupRules, GroupResponseMode } from '@/lib/types/database';

const PRICE_INQUIRY_KEYWORDS = [
  'price', 'prices', 'rate', 'rates', 'cost', 'costs', 'how much', 'how much is',
  'price list', 'price-list', 'quotation', 'quote', 'pricing', 'what is the cost',
  'what is the price', 'send rates', "today's rates", 'rate list',
  'kitna', 'kitne', 'kitni', 'kitna hai', 'kitne ka',
  'charges', 'fees', 'fee', 'charge',
  'product price', 'service price',
  'dam', 'daam', 'kimat',
  'mahangi', 'sasta', 'sasti',
  'offer', 'discount', 'deal',
  'budget', 'afford',
];

export function classifyPriceInquiry(message: string): { isPriceInquiry: boolean; matchedKeywords: string[] } {
  const lower = message.toLowerCase();
  const matched = PRICE_INQUIRY_KEYWORDS.filter((kw) => lower.includes(kw));
  return { isPriceInquiry: matched.length > 0, matchedKeywords: matched };
}

export function shouldReplyInGroup(
  rules: Pick<GroupRules, 'group_ai_enabled' | 'response_mode' | 'custom_rules'>,
  message: string
): { shouldReply: boolean; reason: string } {
  if (!rules.group_ai_enabled) {
    return { shouldReply: false, reason: 'Group AI is disabled.' };
  }

  switch (rules.response_mode) {
    case 'disabled':
      return { shouldReply: false, reason: 'Response mode is set to Disabled.' };

    case 'reply_to_all':
      return { shouldReply: true, reason: 'Reply to all messages mode is active.' };

    case 'mentions_only': {
      const hasMention = message.toLowerCase().includes('@') || message.toLowerCase().includes('agent');
      return hasMention
        ? { shouldReply: true, reason: 'Agent was mentioned in the message.' }
        : { shouldReply: false, reason: 'No mention detected. Agent only replies to mentions.' };
    }

    case 'price_inquiries_only': {
      const { isPriceInquiry, matchedKeywords } = classifyPriceInquiry(message);
      return isPriceInquiry
        ? { shouldReply: true, reason: `Price inquiry detected. Matched: ${matchedKeywords.join(', ')}` }
        : { shouldReply: false, reason: 'No price inquiry detected. Agent only replies to price-related questions.' };
    }

    case 'custom_rules':
      return { shouldReply: true, reason: 'Custom rules mode — agent will evaluate based on custom rules.' };

    default:
      return { shouldReply: false, reason: 'Unknown response mode.' };
  }
}

export const RESPONSE_MODES: { value: GroupResponseMode; label: string; description: string }[] = [
  { value: 'reply_to_all', label: 'Reply to All Messages', description: 'The AI agent replies to every message in group conversations.' },
  { value: 'price_inquiries_only', label: 'Reply Only to Price/Rate Questions', description: 'The AI only replies when the message is about price, rate, cost, charges, fees, or quotations.' },
  { value: 'mentions_only', label: 'Reply Only When Mentioned', description: 'The agent replies only when explicitly mentioned or triggered.' },
  { value: 'custom_rules', label: 'Custom Rules', description: 'Define custom group response rules.' },
  { value: 'disabled', label: 'Disabled', description: 'The agent never replies automatically in groups.' },
];
