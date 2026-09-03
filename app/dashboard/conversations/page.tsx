'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MessageSquare, Users, Bot, Loader2 } from 'lucide-react';
import type { Conversation, Message } from '@/lib/types/database';

export default function ConversationsPage() {
  const { activeBusiness } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    if (!activeBusiness) return;
    (async () => {
      const { data } = await supabase.from('conversations').select('*').eq('business_id', activeBusiness.id).order('created_at', { ascending: false });
      setConversations(data as Conversation[] ?? []);
      setLoading(false);
    })();
  }, [activeBusiness]);

  useEffect(() => {
    if (!selectedId) return;
    setMessagesLoading(true);
    (async () => {
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', selectedId).order('created_at', { ascending: true });
      setMessages(data as Message[] ?? []);
      setMessagesLoading(false);
    })();
  }, [selectedId]);

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading conversations...</div>;

  return (
    <div className="space-y-6">
      {conversations.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4"><MessageSquare className="w-7 h-7 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground mb-2 max-w-md text-center">No conversations yet. Conversations will appear here when your WhatsApp integration is connected and messages start flowing.</p>
          <p className="text-xs text-muted-foreground">WhatsApp integration is planned for the next integration phase.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversation List */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className={`w-full text-left p-3 hover:bg-accent transition-colors ${selectedId === conv.id ? 'bg-accent' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{conv.title || 'Untitled'}</span>
                      <Badge variant="outline" className="text-xs capitalize">{conv.type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {conv.type === 'group' ? <Users className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
                      {conv.channel} · {conv.ai_enabled ? <Badge variant="secondary" className="text-xs">AI On</Badge> : <Badge variant="outline" className="text-xs">AI Off</Badge>}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Messages */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Messages</CardTitle></CardHeader>
            <CardContent>
              {!selectedId ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Select a conversation to view messages.</p>
              ) : messagesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No messages in this conversation.</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.is_inbound ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[75%] p-3 rounded-lg ${msg.is_inbound ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}>
                        {msg.sender_type === 'agent' && <div className="flex items-center gap-1 mb-1 text-xs opacity-70"><Bot className="w-3 h-3" /> Agent</div>}
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-60 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
