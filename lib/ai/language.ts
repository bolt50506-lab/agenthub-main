export type ReplyLanguage = 'english' | 'roman_urdu' | 'urdu' | 'mixed';

const ROMAN_URDU_WORDS = new Set([
  'aap','ap','aapka','aapki','aapke','aapko','apko','aapne','apne','tum','tumhara','tumhari','tumhare',
  'mujhe','mujhy','muj','mera','meri','mere','hum','ham','hamara','hamari','hamare','yeh','ye','woh','wo',
  'kya','kyun','kyu','kyunke','kab','kahan','kaise','kaisay','kaisa','kaisi','kaisy','kese','kesay',
  'kitna','kitni','kitne','kitnay','chahiye','batao','bataye','batain','btao','btaein','bata','batana',
  'karna','karo','karein','karen','krna','krdo','kardo','kar','kr','kro','ho','hai','hain','tha','thi','the',
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
  if (/\u0900-\u097F/.test(value)) return 'roman_urdu';
  if (/[\u0600-\u06FF]/.test(value)) return 'urdu';

  const tokens = words(value);
  if (!tokens.length) return 'english';

  const romanHits = tokens.filter((word) => ROMAN_URDU_WORDS.has(word)).length;
  const englishHits = tokens.filter((word) => ENGLISH_WORDS.has(word)).length;
  const romanScore = romanHits / tokens.length;
  const englishScore = englishHits / tokens.length;

  if (romanHits >= 2 && englishHits >= 2) return 'mixed';
  if (romanHits >= 1 && englishHits >= 2 && englishScore > romanScore * 2) return 'mixed';
  if (romanHits >= 1) return 'roman_urdu';
  if (englishHits >= 1) return 'english';

  return 'english';
}

export function buildLanguageInstruction(text: string): string {
  const language = detectReplyLanguage(text);
  const voiceQuestion = /\b(voice|audio|voice note|voice reply|voice message)\b/i.test(text) &&
    /\b(support|available|feature|reply|replies|message|messages|kar|karo|kro|karta|hota|hai|hain|nahi|nahin|can|does|do)\b/i.test(text);

  if (language === 'roman_urdu') {
    const voiceRule = voiceQuestion
      ? ' The customer is asking about voice capability. VOICE CAPABILITY IS AVAILABLE. Never say, imply, or apologize that voice support/voice replies are unavailable or unsupported. Answer the capability question truthfully: voice replies are supported when the configured delivery mode permits them.'
      : '';
    return 'ABSOLUTE OUTPUT LANGUAGE RULE — HIGHEST PRIORITY: Reply ONLY in natural Roman Urdu using Latin letters. NEVER reply in Hindi. NEVER use Devanagari characters (\u0900-\u097F). NEVER translate Roman Urdu into Hindi. NEVER switch Roman Urdu to English-only. Do not use Urdu/Arabic script. English technical terms, brand names, product names, abbreviations, numbers and currency may remain unchanged, but every normal sentence around them must be Roman Urdu. The dashboard/default language setting MUST NOT override this customer-language rule. Before returning, check every sentence: it must be Roman Urdu, not Hindi and not English-only. Return ONLY the customer-facing reply.' + voiceRule;
  }
  if (language === 'urdu') {
    const voiceRule = voiceQuestion
      ? ' The customer is asking about voice capability. VOICE CAPABILITY IS AVAILABLE. Never say, imply, or apologize that voice support/voice replies are unavailable or unsupported. Answer the capability question truthfully: voice replies are supported when the configured delivery mode permits them.'
      : '';
    return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply in Urdu script. NEVER use Hindi or Devanagari characters. Do not switch to English unless required for a product name, abbreviation, number or technical term. Return ONLY the customer-facing reply.' + voiceRule;
  }
  if (language === 'mixed') {
    const voiceRule = voiceQuestion
      ? ' The customer is asking about voice capability. VOICE CAPABILITY IS AVAILABLE. Never say, imply, or apologize that voice support/voice replies are unavailable or unsupported. Answer the capability question truthfully: voice replies are supported when the configured delivery mode permits them.'
      : '';
    return 'ABSOLUTE OUTPUT LANGUAGE RULE — HIGHEST PRIORITY: Preserve the customer\'s natural English + Roman Urdu mixture. NEVER reply in Hindi. NEVER use Devanagari characters (\u0900-\u097F). Do not convert Roman Urdu into Hindi or English-only. Do not use Urdu/Arabic script unless the customer used it. Return ONLY the customer-facing reply.' + voiceRule;
  }
  if (voiceQuestion) {
    return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply in English. Do not switch to Hindi, Urdu, Roman Urdu or Devanagari unless the customer does. NEVER use Devanagari characters. VOICE CAPABILITY IS AVAILABLE. Never say, imply, or apologize that voice support/voice replies are unavailable or unsupported. Answer the capability question truthfully: voice replies are supported when the configured delivery mode permits them. Return ONLY the customer-facing reply.';
  }
  return 'ABSOLUTE OUTPUT LANGUAGE RULE: Reply in English. Do not switch to Hindi, Urdu, Roman Urdu or Devanagari unless the customer does. NEVER use Devanagari characters. Return ONLY the customer-facing reply.';
}