import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendOnboardingEmail } from '@/lib/email';
import { rateLimit } from '@/lib/rate-limit';
import { apiRequirePermission, getMyAccess } from '@/lib/permissions-server';
import { buildAuthConfirmationUrl } from '@/lib/auth-email-link';
import type { SupabaseClient } from '@supabase/supabase-js';

const schema = z.object({ name:z.string().trim().min(2).max(100), email:z.string().trim().toLowerCase().email(), avatarUrl:z.string().url(), planId:z.string().uuid(), paymentMethod:z.enum(['cash','gcash']), amountPaid:z.number().nonnegative().optional(), startDate:z.string().date().optional() });
function endDate(start:string,days:number){const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function siteUrl(request:Request){return (process.env.NEXT_PUBLIC_SITE_URL?.trim()||process.env.NEXT_PUBLIC_APP_URL?.trim()||new URL(request.url).origin).replace(/\/$/,'')}
async function findAuthUserIdByEmail(admin:ReturnType<typeof createAdminClient>,email:string){
  for(let page=1;page<=20;page+=1){
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
    if(error)return null;
    const match=data.users.find((candidate)=>candidate.email?.toLowerCase()===email);
    if(match)return match.id;
    if(data.users.length<1000)return null;
  }
  return null;
}

export async function POST(request:Request){
  const supabase=await createServerSupabaseClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Unauthorized.'},{status:401});
  const access=await getMyAccess(supabase as unknown as SupabaseClient); const denied=await apiRequirePermission('members:manage',access); if(denied)return denied;
  if(!access.gymId||!['owner','admin','staff'].includes(access.role))return NextResponse.json({error:'Forbidden.'},{status:403});
  if(!rateLimit(`onboard:${access.gymId}`,20,60_000).success)return NextResponse.json({error:'Too many onboarding requests.'},{status:429});
  const parsed=schema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return NextResponse.json({error:'Invalid request body.',issues:parsed.error.issues},{status:400}); const body=parsed.data;
  const admin=createAdminClient();
  const [{data:plan},{data:gym}]=await Promise.all([supabase.from('membership_plans').select('id,duration_days,price,is_active').eq('id',body.planId).eq('gym_id',access.gymId).maybeSingle(),supabase.from('gyms').select('name').eq('id',access.gymId).maybeSingle()]);
  if(!plan?.is_active)return NextResponse.json({error:'Membership plan is invalid or inactive.'},{status:400});

  const {data:existingProfile}=await admin.from('profiles').select('id,name,qr_code').eq('email',body.email).maybeSingle();
  let memberId=existingProfile?.id??null; let magicLink:string|null=null; let createdAccount=false;
  if(!memberId){
    const {data:created,error}=await admin.auth.admin.createUser({email:body.email,email_confirm:true,user_metadata:{name:body.name}});
    if(created.user){memberId=created.user.id;createdAccount=true;}
    else if(error){
      // A historical Auth account can exist without a profile row. Attach it
      // instead of returning Supabase's duplicate-email error to staff.
      memberId=await findAuthUserIdByEmail(admin,body.email);
      if(!memberId)return NextResponse.json({error:'Could not resolve that existing account. Ask the member to sign in once, then try again.'},{status:400});
    }
  }
  if(!memberId)return NextResponse.json({error:'Failed to resolve account.'},{status:400});
  const qrCode=existingProfile?.qr_code||crypto.randomUUID();
  const {error:profileError}=await admin.from('profiles').upsert({id:memberId,email:body.email,name:body.name,avatar_url:body.avatarUrl,qr_code:qrCode},{onConflict:'id'}); if(profileError)return NextResponse.json({error:profileError.message},{status:400});
  const {error:gymUserError}=await admin.from('gym_users').upsert({gym_id:access.gymId,user_id:memberId,role:'member',status:'active',added_by:user.id,updated_at:new Date().toISOString()},{onConflict:'gym_id,user_id'}); if(gymUserError)return NextResponse.json({error:gymUserError.message},{status:400});

  const start=body.startDate??new Date().toISOString().slice(0,10); await admin.from('memberships').update({status:'expired'}).eq('member_id',memberId).eq('gym_id',access.gymId).eq('status','active');
  const {data:membership,error:membershipError}=await admin.from('memberships').insert({member_id:memberId,plan_id:plan.id,gym_id:access.gymId,start_date:start,end_date:endDate(start,plan.duration_days),status:'active',payment_method:body.paymentMethod,amount_paid:body.amountPaid??plan.price,created_by:user.id}).select('id').maybeSingle(); if(membershipError||!membership)return NextResponse.json({error:membershipError?.message??'Failed to create membership.'},{status:400});

  if(createdAccount){
    const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:body.email});
    const tokenHash=link.properties?.hashed_token;
    if(!linkError&&tokenHash)magicLink=buildAuthConfirmationUrl({siteUrl:siteUrl(request),tokenHash,type:'magiclink'});
  }
  const emailResult=createdAccount&&!magicLink
    ? {ok:false as const,error:'The member account was created, but its secure setup link could not be generated.'}
    : await sendOnboardingEmail({to:body.email,memberName:body.name,gymName:gym?.name??'Your Gym',qrPayload:qrCode,magicLink:magicLink??`${siteUrl(request)}/auth?mode=signin`});
  const emailError=emailResult.ok?null:emailResult.error;
  await admin.from('member_onboarding_events').insert({member_id:memberId,gym_id:access.gymId,created_by:user.id,email:body.email,magic_link_url:magicLink,qr_code:qrCode,sent_via:emailResult.ok?'email':'preview'});
  return NextResponse.json({memberId,membershipId:membership.id,qrCode,magicLink,redirectTo:`${siteUrl(request)}/auth/callback`,emailSent:emailResult.ok,emailError,attachedExistingAccount:!createdAccount},{status:emailResult.ok?200:207});
}
