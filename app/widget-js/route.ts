import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function buildApiBase(req: NextRequest): string {
  const proto = req.nextUrl.protocol;
  const host = req.nextUrl.host;
  return `${proto}//${host}`;
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('business');

  if (!businessId) {
    return new NextResponse('Missing business parameter', { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from('integrations')
    .select('status, config')
    .eq('business_id', businessId)
    .eq('type', 'website_chat')
    .single();

  if (!integration || integration.status !== 'connected') {
    return new NextResponse('Widget not active for this business', { status: 404 });
  }

  const config = integration.config as Record<string, unknown>;
  const widgetTitle = (config.widget_title as string) || 'Chat with us';
  const welcomeMessage = (config.welcome_message as string) || 'Hi! How can I help you today?';

  const API_BASE = buildApiBase(req);

  const script = `(function(){
  var BUSINESS_ID=${JSON.stringify(businessId)};
  var WIDGET_TITLE=${JSON.stringify(widgetTitle)};
  var WELCOME_MSG=${JSON.stringify(welcomeMessage)};
  var API_BASE=${JSON.stringify(API_BASE)};
  var CONTAINER;
  var OPEN=false;
  var MESSAGES=[];
  var SESSION_ID=localStorage.getItem('ah_session_'+BUSINESS_ID);
  var VISITOR_ID=localStorage.getItem('ah_visitor_'+BUSINESS_ID);

  function createWidget(){
    CONTAINER=document.createElement('div');
    CONTAINER.id='ah-widget';
    CONTAINER.style.cssText='position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
    document.body.appendChild(CONTAINER);

    var btn=document.createElement('div');
    btn.style.cssText='width:60px;height:60px;border-radius:50%;background:#2563eb;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
    btn.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    btn.onmouseover=function(){btn.style.transform='scale(1.1)';};
    btn.onmouseout=function(){btn.style.transform='scale(1)';};
    btn.onclick=toggleChat;
    CONTAINER.appendChild(btn);

    var panel=document.createElement('div');
    panel.style.cssText='position:absolute;bottom:75px;right:0;width:360px;max-width:calc(100vw - 40px);height:500px;max-height:calc(100vh - 120px);background:white;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:none;flex-direction:column;overflow:hidden;';
    CONTAINER.appendChild(panel);

    var header=document.createElement('div');
    header.style.cssText='background:#2563eb;color:white;padding:16px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:space-between;';
    header.innerHTML='<span>'+WIDGET_TITLE+'</span>';
    var closeBtn=document.createElement('span');
    closeBtn.style.cssText='cursor:pointer;font-size:20px;opacity:0.8;';
    closeBtn.textContent='\u00d7';
    closeBtn.onclick=function(){toggleChat();};
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var msgs=document.createElement('div');
    msgs.style.cssText='flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#f9fafb;';
    panel.appendChild(msgs);

    var inputArea=document.createElement('div');
    inputArea.style.cssText='padding:12px;border-top:1px solid #e5e7eb;display:flex;gap:8px;background:white;';
    panel.appendChild(inputArea);

    var input=document.createElement('input');
    input.type='text';
    input.placeholder='Type a message...';
    input.style.cssText='flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:14px;outline:none;';
    inputArea.appendChild(input);

    var sendBtn=document.createElement('button');
    sendBtn.textContent='Send';
    sendBtn.style.cssText='background:#2563eb;color:white;border:none;border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;font-weight:500;';
    sendBtn.onclick=sendMessage;
    inputArea.appendChild(sendBtn);

    input.addEventListener('keypress',function(e){if(e.key==='Enter')sendMessage();});

    if(WELCOME_MSG){
      addMessage(WELCOME_MSG,'agent');
    }

    MESSAGES.forEach(function(m){addMessage(m.content,m.sender);});

    function toggleChat(){
      OPEN=!OPEN;
      panel.style.display=OPEN?'flex':'none';
    }

    function addMessage(text,sender){
      var msg=document.createElement('div');
      msg.style.cssText='max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.4;'+(sender==='agent'?'background:#2563eb;color:white;align-self:flex-start;':'background:#e5e7eb;color:#1f2937;align-self:flex-end;');
      msg.textContent=text;
      msgs.appendChild(msg);
      msgs.scrollTop=msgs.scrollHeight;
    }

    function sendMessage(){
      var text=input.value.trim();
      if(!text)return;
      input.value='';
      addMessage(text,'user');
      var typing=document.createElement('div');
      typing.style.cssText='background:#e5e7eb;color:#6b7280;align-self:flex-start;padding:10px 14px;border-radius:12px;font-size:14px;font-style:italic;';
      typing.textContent='Typing...';
      msgs.appendChild(typing);
      msgs.scrollTop=msgs.scrollHeight;

      fetch(API_BASE+'/api/widget/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({business_id:BUSINESS_ID,session_id:SESSION_ID,visitor_id:VISITOR_ID,message:text})
      }).then(function(r){return r.json();}).then(function(data){
        typing.remove();
        if(data.error){
          addMessage('Sorry, I could not process your message.','agent');
          return;
        }
        if(data.session_id&&!SESSION_ID){SESSION_ID=data.session_id;localStorage.setItem('ah_session_'+BUSINESS_ID,SESSION_ID);}
        if(data.visitor_id&&!VISITOR_ID){VISITOR_ID=data.visitor_id;localStorage.setItem('ah_visitor_'+BUSINESS_ID,VISITOR_ID);}
        if(data.reply){addMessage(data.reply,'agent');}
      }).catch(function(){
        typing.remove();
        addMessage('Connection error. Please try again.','agent');
      });
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',createWidget);
  } else {
    createWidget();
  }
})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
