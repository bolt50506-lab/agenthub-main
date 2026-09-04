declare module '@/lib/types/database' {
  interface Conversation {
    human_takeover: boolean;
    human_takeover_at: string | null;
    human_takeover_by: string | null;
  }
}

export {};