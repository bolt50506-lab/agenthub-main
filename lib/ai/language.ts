export type ReplyLanguage = 'english' | 'roman_urdu' | 'urdu' | 'mixed';

const ROMAN_URDU_WORDS = new Set([
  'aap','ap','aapka','aapki','aapke','aapko','apko','aapne','apne','tum','tumhara','tumhari','tumhare',
  'mujhe','mujhy','muj','mera','meri','mere','hum','ham','hamara','hamari','hamare','yeh','ye','woh','wo',
  'kya','kyun','kyu','kyunke','kab','kahan','kaise','kaisay','kaisa','kaisi','kaisy','kese','kesay',
  'kitna','kitni','kitne','kitnay','chahiye','batao','bataye','batain','btao','btaein','bata','batana',
  'karna','karo','karein','karen','krna','krdo','kardo','kar','kr','ho','hai','hain','tha','thi','the',
  'hoga','hogi','honge','sakta','sakti','sakte','mil','milega','milyga','aur','se','mein','main','mai',
  'par','pe','wala','wali','wale','nahi','nahin','nai','haan','han','ji','bhai','sir','madam',
  'apna','apni','iska','iski','iske','uska','uski','uske','yahan','wahan','abhi','phir','fir','toh','to',
  'bhi','bas','bohat','bahut','acha','achha','theek','thik','chota','bara','zyada','kam','jaldi','der',
  'kaam','chahte','chahta','chahti','dena','dein','den','de','lena','lein','le','bhejo','bhej','rate',
  'qeemat','daam','paise','rupay','rupees','ka','ke','ki','ko','mein','mera','please','plz','kr','hn'
]);

const ENGLISH_WORDS = new Set([
  'the','is','are','was','were','what','which','how','when','where','why','can','could','would','should',
  'price','cost','need','want','send','tell','give','for','with','and','or','your','you','we','our',
  'this','that','available','today','tomorrow','appointment','book','booking','test','report','result',
  'hello','hi','thanks','thank','yes','no','please','support','feature'
]);

function words(text: string) {
  return text.toLowerCase().match(/[a-z]+/g) || [];
}

export function detectReplyLanguage(text: string): ReplyLanguage {
  const value = text.trim();
  if (!value) return 'english';
  if (/[\u0600-\u06FF]/.test(value)) return 'urdu';

  const tokens = words(value);
  if (!tokens.length) return 'english';

  const romanHits = tokens.filter((word) => ROMAN_URDU_WORDS.has(word)).length;
  const englishHits = tokens.filter((word) => ENGLISH_WORDS.has(word)).length;
  const romanScore = romanHits / tokens.length;
  const englishScore = englishHits / tokens.length;

  // Roman Urdu often contains English business words such as price, CBC,
  // available and test. Even one strong Roman Urdu marker should therefore
  // outweigh generic English vocabulary in short WhatsApp messages.
  if (romanHits >= 2 && englishHits >= 2) return 'mixed';
  if (romanHits >= 1 && englishHits >= 2 && englishScore > romanScore * 2) return 'mixed';
  if (romanHits >= 1) return 'roman_urdu';
  if (englishHits >= 1) return 'english';

  return 'english';
}

export function buildLanguageInstruction(text: string): string {
  const language = detectReplyLanguage(text);
  if (language === 'roman_urdu') {
    return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply ONLY in natural Roman Urdu written with Latin letters. Never answer in English-only. Never use Urdu/Arabic script. English technical terms, brand names, product names, abbreviations, numbers and currency may remain unchanged, but every normal sentence around them must be Roman Urdu. The dashboard/default language setting is ignored for this message. Before returning, check: if the reply could pass as an English sentence, rewrite it into Roman Urdu. Return ONLY the customer-facing reply.';
  }
  if (language === 'urdu') {
    return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply in Urdu script. Do not switch to English unless required for a product name, abbreviation, number or technical term. Return ONLY the customer-facing reply.';
  }
  if (language === 'mixed') {
    return 'ABSOLUTE OUTPUT LANGUAGE RULE: Preserve the customer\'s natural English + Roman Urdu mixture. Do not convert their Roman Urdu into English-only and do not use Urdu/Arabic script unless the customer used it. Return ONLY the customer-facing reply.';
  }
  return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply in English. Do not switch to Urdu or Roman Urdu unless the customer does. Return ONLY the customer-facing reply.';
}
