import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateAIResponseWithFallback, type ProviderConfig } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let stage = 'start';
  try {
    const expectedSecret = process.env.AGENTHUB_WEBHOOK_SECRET || process.env.WHATSAPP_SERVICE_SECRET || '';
    const auth = req.headers.get('authorization') || '';
    if (expectedSecret && auth !== `Bearer ${expectedSecret}`) return NextResponse.json({ok:false,stage:'auth',error:'Unauthorized'},{status:401});
    stage='parse_body';
    const body=await req.json();
    const sessionId=String(body.session_id||'').trim();
    const from=String(body.from||'').trim();
    const message=String(body.message||'').trim();
    const phone=String(body.phone_number||'').trim();
    const businessIdFromBody=String(body.business_id||'').trim();
    stage='supabase_client';
    const supabase=createServiceClient();
    stage='session_lookup';
    const {data:session,error:sessionError}=await supabase.from('whatsapp_sessions').select('id,business_id,integration_id,session_id').eq('session_id',sessionId).maybeSingle();
    if(sessionError) return NextResponse.json({ok:false,stage,error:sessionError.message,details:sessionError},{status:500});
    if(!session) return NextResponse.json({ok:false,stage,error:'session not found'},{status:404});
    const businessId=session.business_id;
    stage='integration_lookup';
    const {data:integration,error:integrationError}=await supabase.from('integrations').select('id,config').eq('business_id',businessId).eq('type','whatsapp').order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(integrationError) return NextResponse.json({ok:false,stage,error:integrationError.message,details:integrationError},{status:500});
    stage='business_lookup';
    const {data:business,error:businessError}=await supabase.from('businesses').select('id,name,industry,description,website,phone,address,timezone,working_hours,welcome_message').eq('id',businessId).maybeSingle();
    if(businessError) return NextResponse.json({ok:false,stage,error:businessError.message,details:businessError},{status:500});
    stage='voice_profile_lookup';
    const {data:voiceProfile,error:voiceError}=await supabase.from('voice_profiles').select('id').eq('business_id',businessId).eq('is_default',true).eq('status','active').maybeSingle();
    if(voiceError) return NextResponse.json({ok:false,stage,error:voiceError.message,details:voiceError},{status:500});
    stage='duplicate_lookup';
    const messageId=typeof body.message_id==='string'&&body.message_id.trim()?body.message_id.trim():null;
    if(messageId){
      const {data:dup,error:dupError}=await supabase.from('messages').select('id').eq('business_id',businessId).eq('metadata->>whatsapp_message_id',messageId).limit(1).maybeSingle();
      if(dupError) return NextResponse.json({ok:false,stage,error:dupError.message,details:dupError},{status:500});
    }
    stage='lead_lookup';
    if(!String(from).endsWith('@g.us')){
      const incomingPhone=phone || (String(from).endsWith('@lid') ? null : String(from).replace('@s.whatsapp.net','').replace('@c.us','').trim());
      if(incomingPhone){
        const {data:leads,error:leadError}=await supabase.from('leads').select('id').eq('business_id',businessId).or(`phone.eq.${incomingPhone},phone_number.eq.${incomingPhone},customer_phone.eq.${incomingPhone}`).limit(20);
        if(leadError) return NextResponse.json({ok:false,stage,error:leadError.message,details:leadError},{status:500});
      }
    }
    stage='agent_lookup';
    const {data:agent,error:agentError}=await supabase.from('agents').select('id,business_id,name,purpose,description,communication_style,primary_goal,supported_languages,status,ai_provider,knowledge_source_ids,enabled_capabilities').eq('business_id',businessId).eq('status','active').limit(1).maybeSingle();
    if(agentError) return NextResponse.json({ok:false,stage,error:agentError.message,details:agentError},{status:500});
    stage='agent_settings_lookup';
    if(agent){
      const {error:e}=await supabase.from('agent_settings').select('id,agent_id,business_id,tone,greeting_behavior,auto_create_leads,appointments_enabled,auto_followups_enabled,max_response_length,response_language,custom_instructions').eq('business_id',businessId).eq('agent_id',agent.id).maybeSingle();
      if(e) return NextResponse.json({ok:false,stage,error:e.message,details:e},{status:500});
    }
    stage='products_lookup';
    const {error:productsError}=await supabase.from('products').select('id,business_id,category_id,name,description,price,currency,availability,status').eq('business_id',businessId).eq('status','active').limit(100);
    if(productsError) return NextResponse.json({ok:false,stage,error:productsError.message,details:productsError},{status:500});
    stage='services_lookup';
    const {error:servicesError}=await supabase.from('services').select('id,name,description,price,currency,duration_minutes,advance_required,status').eq('business_id',businessId).eq('status','active').limit(100);
    if(servicesError) return NextResponse.json({ok:false,stage,error:servicesError.message,details:servicesError},{status:500});
    stage='knowledge_lookup';
    const {error:knowledgeError}=await supabase.from('knowledge_items').select('id,business_id,title,category,content,tags,metadata,status').eq('business_id',businessId).eq('status','active').limit(50);
    if(knowledgeError) return NextResponse.json({ok:false,stage,error:knowledgeError.message,details:knowledgeError},{status:500});
    stage='plans_lookup';
    const {error:plansError}=await supabase.from('subscription_plans').select('name,description,price_cents,yearly_price_cents,currency,billing_period,features,is_active,sort_order').eq('is_active',true).order('sort_order',{ascending:true});
    if(plansError) return NextResponse.json({ok:false,stage,error:plansError.message,details:plansError},{status:500});
    stage='provider_lookup';
    const {data:providerRows,error:providerError}=await supabase.from('ai_provider_configs').select('provider,api_key_encrypted,base_url,model,priority').eq('is_enabled',true).order('priority',{ascending:true});
    if(providerError) return NextResponse.json({ok:false,stage,error:providerError.message,details:providerError},{status:500});
    const providerConfigs:ProviderConfig[]=(providerRows||[]).map(row=>({provider:row.provider,apiKey:row.api_key_encrypted||undefined,apiUrl:row.base_url||undefined,model:row.model,temperature:0.7,maxTokens:1024}));
    stage='ai_test';
    const ai=await generateAIResponseWithFallback({messages:[{role:'user',content:message||'hi'}],systemPrompt:'Reply with one short friendly sentence.',temperature:0.2,maxTokens:100,businessId},providerConfigs);
    if(ai.error) return NextResponse.json({ok:false,stage,error:ai.error,provider:ai.provider,model:ai.model},{status:500});
    return NextResponse.json({ok:true,stage:'complete',session_id:sessionId,business_id:businessId,business_name:business?.name,provider:ai.provider,model:ai.model,reply:ai.content,voice_profile:voiceProfile?.id||null,integration_id:integration?.id||null});
  } catch(error) {
    return NextResponse.json({ok:false,stage,error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:null},{status:500});
  }
}