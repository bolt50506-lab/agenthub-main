'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Users, Bot, Loader2, Search, Send, Globe2, Smartphone, RefreshCw } from 'lucide-react';
import type { Conversation, Customer, Message } from '@/lib/types/database';

type ConversationRow = Conversation & { customer?: Customer | null; lastPreview?: string | null };

export default function ConversationsPage() {
  const { activeBusiness } = useAuth();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState<'all' | 'website_chat' | 'whatsapp'>('all');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    if (!activeBusiness) return;

    const { data: convData } = await supabase
      .from('conversations')
      .select('*')
      .eq('business_id', activeBusiness.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    const rows = (convData as Conversation[]) ?? [];
    const customerIds = Array.from(new Set(rows.map((c) => c.customer_id).filter((id): id is string => Boolean(id))));

    let customerMap = new Map<string, Customer>();
    if (customerIds.length) {
      const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .in('id', customerIds);
      customerMap = new Map(((customers as Customer[]) ?? []).map((customer) => [customer.id, customer]));
    }

    const latestPreview = new Map<string, string>();
    if (rows.length) {
      const { data: allMessages } = await supabase
        .from('messages')
        .select('conversation_id, content, created_at')
        .eq('business_id', activeBusiness.id)
        .order('created_at', { ascending: false })
        .limit(200);

      for (const message of allMessages ?? []) {
        if (!latestPreview.has(message.conversation_id)) {
          latestPreview.set(message.conversation_id, message.content);
        }
      }
    }

    setConversations(rows.map((conversation) => ({
      ...conversation,
      customer: conversation.customer_id ? customerMap.get(conversation.customer_id) ?? null : null,
      lastPreview: latestPreview.get(conversation.id) ?? null,
    })));

    setSelectedId((current) => {
      if (current && rows.some((conversation) => conversation.id === current)) return current;
      return rows[0]?.id ?? null;
    });

    setLoading(false);
  }, [activeBusiness]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    setMessages((data as Message[]) ?? []);
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    loadMessages(selectedId);
  }, [selectedId, loadMessages]);

  // Lightweight polling keeps WhatsApp and widget conversations current even when
  // the Supabase Realtime publication is not enabled for these tables.
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadConversations();
      if (selectedId) loadMessages(selectedId);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (channel !== 'all' && conversation.channel !== channel) return false;
      if (!query) return true;
      const label = getConversationLabel(conversation).toLowerCase();
      return label.includes(query) || (conversation.lastPreview || '').toLowerCase().includes(query);
    });
  }, [conversations, search, channel]);

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  const sendManualReply = async () => {
    if (!activeBusiness || !selectedId || !replyText.trim() || sending) return;

    setSending(true);
    const content = replyText.trim();
    const { error } = await supabase.from('messages').insert({
      business_id: activeBusiness.id,
      conversation_id: selectedId,
      sender_type: 'business',
      content,
      content_type: 'text',
      is_inbound: false,
    });

    if (!error) {
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedId);

      setReplyText('');
      await Promise.all([loadMessages(selectedId), loadConversations()]);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Conversation Inbox</h2>
          <p className="text-sm text-muted-foreground">
            See customer messages from your website widget and connected WhatsApp in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadConversations(); if (selectedId) loadMessages(selectedId); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">All conversations</CardTitle>
              <Badge variant="secondary">{filteredConversations.length}</Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="pl-9" />
            </div>
            <div className="flex gap-2">
              {[
                ['all', 'All'],
                ['website_chat', 'Website'],
                ['whatsapp', 'WhatsApp'],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  variant={channel === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChannel(value as typeof channel)}
                  className="text-xs"
                >
                  {label}
                </Button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="max-h-[620px] overflow-y-auto p-0">
            {filteredConversations.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Messages from the website widget and WhatsApp will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredConversations.map((conversation) => {
                  const isSelected = selectedId === conversation.id;
                  const isWebsite = conversation.channel === 'website_chat';
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedId(conversation.id)}
                      className={`w-full px-4 py-4 text-left transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/60'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isWebsite ? 'bg-blue-500/10 text-blue-600' : 'bg-green-500/10 text-green-600'}`}>
                          {isWebsite ? <Globe2 className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">{getConversationLabel(conversation)}</p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{formatTime(conversation.last_message_at || conversation.created_at)}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{conversation.lastPreview || 'Conversation started'}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              {isWebsite ? 'Website' : conversation.channel}
                            </Badge>
                            {conversation.ai_enabled ? (
                              <span className="flex items-center gap-1 text-[10px] text-primary"><Bot className="h-3 w-3" /> AI active</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[620px] flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              <CardHeader className="border-b pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {selectedConversation.type === 'group' ? <Users className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{getConversationLabel(selectedConversation)}</CardTitle>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {selectedConversation.channel === 'website_chat' ? <Globe2 className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                      <span>{selectedConversation.channel === 'website_chat' ? 'Website Widget' : selectedConversation.channel}</span>
                      {selectedConversation.ai_enabled && <Badge variant="secondary" className="h-5 text-[10px]">AI On</Badge>}
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                  {messagesLoading ? (
                    <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No messages in this conversation.</div>
                  ) : (
                    messages.map((message) => {
                      const outbound = !message.is_inbound;
                      const human = message.sender_type === 'business';
                      return (
                        <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${outbound ? (human ? 'bg-foreground text-background' : 'bg-primary text-primary-foreground') : 'bg-card border'}`}>
                            {message.sender_type === 'agent' && <div className="mb-1 flex items-center gap-1 text-[10px] opacity-70"><Bot className="h-3 w-3" /> AgentHub AI</div>}
                            {message.sender_type === 'business' && <div className="mb-1 text-[10px] opacity-70">Team reply</div>}
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                            <p className="mt-1 text-right text-[10px] opacity-60">{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t bg-card p-3">
                  {selectedConversation.channel === 'website_chat' ? (
                    <>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Team replies are delivered live to the visitor&apos;s open AgentHub website chat.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendManualReply(); } }}
                          placeholder="Type a team reply..."
                          disabled={sending}
                        />
                        <Button onClick={sendManualReply} disabled={!replyText.trim() || sending}>
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      WhatsApp messages are visible here for monitoring. Manual WhatsApp replies will be enabled through the connected WhatsApp provider service.
                    </p>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-1 flex-col items-center justify-center">
              <MessageSquare className="mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm font-medium">Select a conversation</p>
              <p className="mt-1 text-xs text-muted-foreground">Choose a customer conversation to view the full message history.</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

function getConversationLabel(conversation: ConversationRow): string {
  if (conversation.title) return conversation.title;
  if (conversation.customer?.name && conversation.customer.name !== 'Website Visitor') return conversation.customer.name;
  if (conversation.customer?.phone) return conversation.customer.phone;
  if (conversation.channel === 'website_chat') return 'Website Visitor';
  return 'Customer';
}

function formatTime(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
