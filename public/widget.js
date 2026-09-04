(function () {
  'use strict';

  var currentScript = document.currentScript;
  var params = new URLSearchParams(currentScript && currentScript.src ? currentScript.src.split('?')[1] || '' : '');
  var BUSINESS_ID = params.get('business');
  if (!BUSINESS_ID) return;

  var API_BASE = new URL(currentScript.src).origin;
  var SESSION_KEY = 'ah_session_' + BUSINESS_ID;
  var VISITOR_KEY = 'ah_visitor_' + BUSINESS_ID;
  var REPLY_KEY = 'ah_last_business_reply_' + BUSINESS_ID;
  var sessionId = localStorage.getItem(SESSION_KEY);
  var visitorId = localStorage.getItem(VISITOR_KEY);
  var lastReplyAt = localStorage.getItem(REPLY_KEY) || '';
  var open = false;
  var busy = false;
  var root = document.createElement('div');
  root.id = 'agenthub-customer-widget';

  var style = document.createElement('style');
  style.textContent = `
    #agenthub-customer-widget{position:fixed;right:22px;bottom:22px;z-index:2147483647;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
    #agenthub-customer-widget *{box-sizing:border-box}
    .ah-launch-wrap{position:relative;display:flex;align-items:center;gap:10px;justify-content:flex-end}
    .ah-teaser{background:#fff;color:#172033;border:1px solid rgba(15,23,42,.08);border-radius:16px;padding:9px 13px;font-size:13px;font-weight:600;box-shadow:0 8px 30px rgba(15,23,42,.14);animation:ahFloat 3s ease-in-out infinite;white-space:nowrap;cursor:pointer}
    .ah-teaser:after{content:"";position:absolute;right:69px;bottom:18px;width:10px;height:10px;background:#fff;transform:rotate(45deg);border-right:1px solid rgba(15,23,42,.08);border-top:1px solid rgba(15,23,42,.08)}
    .ah-launch{position:relative;width:66px;height:66px;border:0;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2563eb,#7c3aed);box-shadow:0 12px 30px rgba(37,99,235,.42),0 0 0 0 rgba(59,130,246,.45);transition:transform .22s ease,box-shadow .22s ease;animation:ahPulse 2.4s infinite}
    .ah-launch:hover{transform:translateY(-3px) scale(1.06);box-shadow:0 16px 38px rgba(37,99,235,.5)}
    .ah-launch svg{width:31px;height:31px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.18))}
    .ah-spark{position:absolute;top:2px;right:4px;font-size:15px;animation:ahSpark 1.8s ease-in-out infinite}
    .ah-unread{position:absolute;right:-1px;top:-2px;min-width:20px;height:20px;border-radius:10px;background:#ef4444;color:#fff;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;border:2px solid #fff}
    .ah-panel{position:absolute;right:0;bottom:80px;width:370px;max-width:calc(100vw - 28px);height:540px;max-height:calc(100vh - 115px);background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(15,23,42,.24);border:1px solid rgba(15,23,42,.08);display:none;flex-direction:column;transform-origin:bottom right}
    .ah-panel.ah-open{display:flex;animation:ahOpen .25s cubic-bezier(.2,.8,.2,1)}
    .ah-head{padding:17px 17px 15px;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);position:relative;overflow:hidden}
    .ah-head:before{content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-75px;top:-105px;background:rgba(255,255,255,.12)}
    .ah-head-row{position:relative;display:flex;align-items:center;gap:11px}
    .ah-avatar{width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.25)}
    .ah-avatar svg{width:23px;height:23px}
    .ah-title{font-size:15px;font-weight:800;line-height:1.2}
    .ah-online{font-size:11px;opacity:.88;margin-top:3px;display:flex;align-items:center;gap:5px}
    .ah-online i{width:7px;height:7px;border-radius:50%;background:#86efac;box-shadow:0 0 0 3px rgba(134,239,172,.16)}
    .ah-close{margin-left:auto;width:32px;height:32px;border:0;background:rgba(255,255,255,.13);color:#fff;border-radius:10px;font-size:22px;cursor:pointer;line-height:1}
    .ah-messages{flex:1;overflow-y:auto;padding:17px;background:linear-gradient(180deg,#f8faff,#f8fafc)}
    .ah-msg{max-width:84%;padding:10px 13px;border-radius:15px;font-size:13.5px;line-height:1.45;margin:0 0 9px;white-space:pre-wrap;word-break:break-word;animation:ahMsg .2s ease}
    .ah-msg.agent{background:#fff;color:#172033;border:1px solid #e8edf5;border-bottom-left-radius:5px;box-shadow:0 3px 12px rgba(15,23,42,.05)}
    .ah-msg.user{margin-left:auto;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;border-bottom-right-radius:5px;box-shadow:0 4px 12px rgba(37,99,235,.16)}
    .ah-typing{display:flex;align-items:center;gap:4px;width:max-content;background:#fff;border:1px solid #e8edf5;border-radius:15px;padding:11px 13px;margin-bottom:9px;animation:ahMsg .2s ease}
    .ah-typing span{width:5px;height:5px;border-radius:50%;background:#94a3b8;animation:ahDot 1.2s infinite}.ah-typing span:nth-child(2){animation-delay:.15s}.ah-typing span:nth-child(3){animation-delay:.3s}
    .ah-input{padding:11px;border-top:1px solid #e8edf5;background:#fff;display:flex;gap:8px}
    .ah-input input{min-width:0;flex:1;height:42px;border:1px solid #dbe3ef;border-radius:13px;padding:0 13px;font-size:13.5px;outline:0;background:#f8fafc;color:#172033}
    .ah-input input:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.1);background:#fff}
    .ah-send{width:43px;height:42px;border:0;border-radius:13px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s ease}.ah-send:hover{transform:scale(1.04)}.ah-send:disabled{opacity:.55;cursor:default;transform:none}
    .ah-powered{text-align:center;font-size:9px;color:#94a3b8;padding:0 0 7px;background:#fff;letter-spacing:.1px}
    @keyframes ahPulse{0%,100%{box-shadow:0 12px 30px rgba(37,99,235,.42),0 0 0 0 rgba(59,130,246,.45)}50%{box-shadow:0 14px 34px rgba(37,99,235,.48),0 0 0 9px rgba(59,130,246,0)}}
    @keyframes ahFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    @keyframes ahSpark{0%,100%{transform:scale(1) rotate(0);opacity:.75}50%{transform:scale(1.25) rotate(12deg);opacity:1}}
    @keyframes ahOpen{from{opacity:0;transform:scale(.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
    @keyframes ahMsg{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    @keyframes ahDot{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-4px);opacity:1}}
    @media(max-width:480px){#agenthub-customer-widget{right:12px;bottom:12px}.ah-panel{right:0;width:min(370px,calc(100vw - 24px));height:min(540px,calc(100vh - 92px));bottom:76px}.ah-teaser{display:none}.ah-launch{width:62px;height:62px}}
    @media(prefers-reduced-motion:reduce){.ah-launch,.ah-teaser,.ah-spark,.ah-panel.ah-open,.ah-msg,.ah-typing,.ah-typing span{animation:none!important}}
  `;
  document.head.appendChild(style);

  var panel = document.createElement('div'); panel.className = 'ah-panel';
  var head = document.createElement('div'); head.className = 'ah-head';
  var headRow = document.createElement('div'); headRow.className = 'ah-head-row';
  var avatar = document.createElement('div'); avatar.className = 'ah-avatar';
  avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c4.97 0 9 3.36 9 7.5S16.97 18 12 18c-1.1 0-2.15-.16-3.1-.46L5 20l1.1-3.05C4.2 15.58 3 13.22 3 10.5 3 6.36 7.03 3 12 3Z"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke-linecap="round"/></svg>';
  var titleBox = document.createElement('div');
  var title = document.createElement('div'); title.className = 'ah-title'; title.textContent = 'AI Assistant';
  var online = document.createElement('div'); online.className = 'ah-online'; online.innerHTML = '<i></i> Online • Ready to help';
  titleBox.appendChild(title); titleBox.appendChild(online);
  var close = document.createElement('button'); close.className = 'ah-close'; close.setAttribute('aria-label','Close chat'); close.textContent = '×';
  headRow.appendChild(avatar); headRow.appendChild(titleBox); headRow.appendChild(close); head.appendChild(headRow); panel.appendChild(head);

  var messages = document.createElement('div'); messages.className = 'ah-messages'; panel.appendChild(messages);
  var inputArea = document.createElement('div'); inputArea.className = 'ah-input';
  var input = document.createElement('input'); input.type='text'; input.placeholder='Ask us anything…'; input.setAttribute('aria-label','Message');
  var send = document.createElement('button'); send.className='ah-send'; send.setAttribute('aria-label','Send message'); send.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';
  inputArea.appendChild(input); inputArea.appendChild(send); panel.appendChild(inputArea);
  var powered = document.createElement('div'); powered.className='ah-powered'; powered.textContent='Instant AI assistance'; panel.appendChild(powered);

  var launchWrap=document.createElement('div'); launchWrap.className='ah-launch-wrap';
  var teaser=document.createElement('div'); teaser.className='ah-teaser'; teaser.textContent='Need help? Chat with us 👋';
  var launch=document.createElement('button'); launch.className='ah-launch'; launch.setAttribute('aria-label','Open chat');
  launch.innerHTML='<span class="ah-spark">✦</span><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.45 8.8 8.8 0 0 1-3-.5L5 20l1.45-3.35A7.2 7.2 0 0 1 4.5 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/></svg>';
  var unread=document.createElement('span'); unread.className='ah-unread'; unread.textContent='1'; launch.appendChild(unread);
  launchWrap.appendChild(teaser); launchWrap.appendChild(launch); root.appendChild(panel); root.appendChild(launchWrap); document.body.appendChild(root);

  function addMessage(text, who){ if(!text)return; var el=document.createElement('div'); el.className='ah-msg '+who; el.textContent=text; messages.appendChild(el); messages.scrollTop=messages.scrollHeight; }
  function addTyping(){ var el=document.createElement('div'); el.className='ah-typing'; el.id='ah-typing'; el.innerHTML='<span></span><span></span><span></span>'; messages.appendChild(el); messages.scrollTop=messages.scrollHeight; }
  function removeTyping(){var el=document.getElementById('ah-typing');if(el)el.remove();}
  function toggle(){ open=!open; panel.classList.toggle('ah-open',open); unread.style.display='none'; if(open){input.focus();poll();}}
  launch.onclick=toggle; teaser.onclick=toggle; close.onclick=toggle;

  addMessage('Hi! 👋 How can I help you today?', 'agent');

  function poll(){
    if(!sessionId||!visitorId)return;
    var url=API_BASE+'/api/widget/messages?business_id='+encodeURIComponent(BUSINESS_ID)+'&session_id='+encodeURIComponent(sessionId)+'&visitor_id='+encodeURIComponent(visitorId)+(lastReplyAt?'&after='+encodeURIComponent(lastReplyAt):'');
    fetch(url).then(function(r){return r.ok?r.json():null}).then(function(data){
      if(!data||!data.messages)return;
      data.messages.forEach(function(m){addMessage(m.content,'agent');if(m.created_at){lastReplyAt=m.created_at;localStorage.setItem(REPLY_KEY,lastReplyAt);}});
    }).catch(function(){});
  }

  function sendMessage(){
    if(busy)return; var text=input.value.trim(); if(!text)return;
    busy=true; send.disabled=true; input.value=''; addMessage(text,'user'); addTyping();
    fetch(API_BASE+'/api/widget/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id:BUSINESS_ID,session_id:sessionId,visitor_id:visitorId,message:text})})
      .then(function(r){return r.json()})
      .then(function(data){
        removeTyping();
        if(data.session_id){sessionId=data.session_id;localStorage.setItem(SESSION_KEY,sessionId)}
        if(data.visitor_id){visitorId=data.visitor_id;localStorage.setItem(VISITOR_KEY,visitorId)}
        if(data.reply) addMessage(data.reply,'agent');
        else if(data.mode==='human') addMessage('Thanks! A team member will reply shortly.','agent');
        else addMessage('I’m having trouble connecting right now. Please try again in a moment.','agent');
        poll();
      })
      .catch(function(){removeTyping();addMessage('Connection issue. Please try again.','agent');})
      .finally(function(){busy=false;send.disabled=false;input.focus()});
  }
  send.onclick=sendMessage; input.addEventListener('keydown',function(e){if(e.key==='Enter')sendMessage()});
  setInterval(function(){if(open)poll()},4000);
})();
