export type ReplyLanguage = 'english' | 'roman_urdu' | 'urdu' | 'mixed';

const ROMAN_URDU_WORDS = new Set([
  'aap','ap','aapka','aapki','aapke','aapko','apko','aapne','apne','tum','tumhara','tumhari','tumhare',
  'mujhe','mujhy','mera','meri','mere','hum','ham','hamara','hamari','hamare','yeh','ye','woh','wo',
  'kya','kyun','kyu','kyunke','kab','kahan','kaise','kaisay','kaisa','kaisi','kaisy','kese','kesay',
  'kitna','kitni','kitne','chahiye','batao','bataye','batain','btao','btaein','karna','karo','karein',
  'krna','krdo','kardo','ho','hai','hain','tha','thi','the','hoga','hogi','honge','sakta','sakti','sakte',
  'mil','milega','milega','milyga','aur','se','mein','main','mai','par','pe','wala','wali','wale','nahi',
  'nahin','nai','haan','han','ji','bhai','sir','madam','mujh','apna','apni','apne','iska','iski','iske',
  'uska','uski','uske','yahan','wahan','abhi','phir','fir','toh','to','bhi','bas','bohat','bahut','acha',
  'achha','theek','thik','chota','bara','zyada','kam','jaldi','der','kaam','chahte','chahta','chahti',
  'dena','dein','de','lena','lein','le','bhejo','bhej','kardo','kar','kr','rate','qeemat','daam','paise',
  'rupay','rupees','kitnay','kitni','kitne','ka','ke','ki','ko','please','plz'
]);

const ENGLISH_WORDS = new Set([
  'the','is','are','was','were','what','which','how','when','where','why','can','could','would','should',
  'please','price','cost','need','want','send','tell','give','for','with','and','or','your','you','we','our',
  'this','that','available','today','tomorrow','appointment','book','booking','test','report','result','hello',
  'hi','thanks','thank','yes','no'
]);

function words(text: string) {
  return text.toLowerCase().match(/[a-z]+/g) || [];
}

export function detectReplyLanguage(text: string): ReplyLanguage {
  const value = text.trim();
  if (!value) return 'english';
  if (/[\u0600-\u06FF]/.test(value)) return 'urdu';

  const tokens = words(value);
  const romanHits = tokens.filter((word) => ROMAN_URDU_WORDS.has(word)).length;
  const englishHits = tokens.filter((word) => ENGLISH_WORDS.has(word)).length;

  if (romanHits >= 2 && englishHits >= 2) return 'mixed';
  if (romanHits >= 2) return 'roman_urdu';
  return 'english';
}

export function buildLanguageInstruction(text: string): string {
  const language = detectReplyLanguage(text);
  if (language === 'roman_urdu') {
    return 'HIGHEST PRIORITY: Reply entirely in Roman Urdu using Latin/English letters. Do NOT use Urdu/Arabic script. Do NOT answer in English. Keep common business terms, product names, numbers and currency as written, but construct the surrounding sentence naturally in Roman Urdu. Example style: "Ji bilkul, aap ko CBC ka rate 500 PKR hai." If your draft contains Urdu script or is mostly English, rewrite it before returning. Return ONLY the customer-facing reply.';
  }
  if (language === 'urdu') {
    return 'HIGHEST PRIORITY: Reply in Urdu script. Do not switch to English unless the customer does so. Return ONLY the customer-facing reply.';
  }
  if (language === 'mixed') {
    return 'HIGHEST PRIORITY: Reply in the same natural English + Roman Urdu mix used by the customer. Do not convert Roman Urdu into English-only and do not use Urdu/Arabic script unless the customer uses it. Return ONLY the customer-facing reply.';
  }
  return 'HIGHEST PRIORITY: Reply in English. Do not switch to Urdu or Roman Urdu unless the customer does so. Return ONLY the customer-facing reply.';
}
