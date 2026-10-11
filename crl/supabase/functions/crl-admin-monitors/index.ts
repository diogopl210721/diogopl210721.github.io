import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://www.ddsinovacao.com.br", "https://ddsinovacao.com.br"]);
const responseHeaders = (origin: string | null) => ({
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.ddsinovacao.com.br",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store",
});
const reply = (data: Record<string, unknown>, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(data), { status, headers: responseHeaders(origin) });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (req.method !== "POST") return reply({ error: "Método não autorizado" }, 405, origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: "Origem não autorizada" }, 403, origin);

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!bearer) return reply({ error: "Autenticação obrigatória" }, 401, origin);
  if (Number(req.headers.get("content-length") || 0) > 4096) return reply({ error: "Requisição muito grande" }, 413, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply({ error: "Serviço indisponível" }, 503, origin);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: auth, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !auth.user) return reply({ error: "Sessão inválida" }, 401, origin);

    const { data: actor, error: roleError } = await admin
      .from("crl_members")
      .select("institution_id, role, active")
      .eq("auth_user_id", auth.user.id)
      .eq("role", "admin")
      .eq("active", true)
      .maybeSingle();
    if (roleError || !actor) return reply({ error: "Somente ADM da CRL" }, 403, origin);

    const input = await req.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return reply({ error: "Dados inválidos" }, 400, origin);

    const action = String(input.action || "");
    if (action === "list") {
      const { data, error } = await admin.from("crl_members")
        .select("id,username,display_name,role,active,monitor_vinculo,resident_id,monitor_phone,monitor_started_on,salary_monthly,created_at")
        .eq("institution_id", actor.institution_id).eq("role", "monitor")
        .order("display_name").limit(200);
      if (error) return reply({ error: "Não foi possível consultar os monitores" }, 500, origin);
      return reply({ monitors: data || [] }, 200, origin);
    }

    const pwd = String(input.password || "");
    const strong = pwd.length >= 12 && pwd.length <= 128 &&
      /[a-z]/.test(pwd) && /[A-Z]/.test(pwd) && /\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd);
    if (action === "create") {
      const username = String(input.username || "").trim().toLowerCase();
      const displayName = String(input.display_name || "").trim();
      const vinculo = String(input.monitor_vinculo || "").trim().toLowerCase();
      const residentId = String(input.resident_id || "").trim();
      const salary = input.salary_monthly == null || input.salary_monthly === "" ? null : Number(input.salary_monthly);
      const phone = String(input.monitor_phone || "").trim().slice(0,40);
      let effectiveName=displayName;
      if(vinculo==="aluno") {
        if(!/^[0-9a-f-]{36}$/i.test(residentId))return reply({error:"Selecione um aluno cadastrado"},400,origin);
        const {data:stay}=await admin.from("crl_stays").select("id").eq("institution_id",actor.institution_id).eq("resident_id",residentId).eq("status","active").maybeSingle();
        if(!stay)return reply({error:"Aluno sem acolhimento ativo"},422,origin);
        const {data:resident}=await admin.from("crl_residents").select("full_name").eq("id",residentId).eq("institution_id",actor.institution_id).maybeSingle();
        if(!resident?.full_name)return reply({error:"Prontuário do aluno não encontrado"},422,origin);
        const {data:existing}=await admin.from("crl_members").select("id").eq("institution_id",actor.institution_id).eq("resident_id",residentId).eq("role","monitor").maybeSingle();
        if(existing)return reply({error:"Este aluno já possui monitor cadastrado"},409,origin);
        effectiveName=resident.full_name;
      }
      if(vinculo==="contratado"&&(!Number.isFinite(salary)||salary===null||salary<=0))return reply({error:"Informe salário mensal válido"},400,origin);
      if (!["aluno", "voluntario", "contratado"].includes(vinculo)) return reply({ error: "Selecione o vínculo: aluno, voluntário ou contratado" }, 400, origin);
      if (!/^[a-z][a-z0-9._-]{2,39}$/.test(username) || displayName.length < 3 || displayName.length > 120)
        return reply({ error: "Informe um nome e usuário válidos" }, 400, origin);
      if (!strong) return reply({ error: "A senha precisa ter 12 ou mais caracteres, incluindo maiúscula, minúscula, número e símbolo" }, 400, origin);

      const { data: duplicate } = await admin.from("crl_members")
        .select("id").eq("username", username).eq("institution_id", actor.institution_id).maybeSingle();
      if (duplicate) return reply({ error: "Este usuário já está cadastrado" }, 409, origin);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: username + "@crl.ddsinovacao.com.br",
        password: pwd,
        email_confirm: true,
        user_metadata: { app: "crl", display_name: effectiveName }
      });
      if (createError || !created.user) return reply({ error: "Não foi possível criar o usuário. Verifique se já existe" }, 409, origin);

      const { error: memberError } = await admin.from("crl_members").insert({
        institution_id: actor.institution_id,
        auth_user_id: created.user.id,
        username,
        display_name: effectiveName,
        role: "monitor", monitor_vinculo: vinculo,
        resident_id:vinculo==="aluno"?residentId:null,
        monitor_phone:phone||null,monitor_started_on:new Date().toISOString().slice(0,10),
        salary_monthly:vinculo==="contratado"?salary:null,
        active: true
      });
      if (memberError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return reply({ error: "Não foi possível vincular o usuário à CRL" }, 500, origin);
      }
      await admin.from("crl_audit_events").insert({
        institution_id: actor.institution_id, actor_id: auth.user.id,
        action: "monitor_created", entity_name: "crl_members",
        entity_id: created.user.id,
        data: { username }
      });
      return reply({ success: true, username }, 201, origin);
    }

    if (!["block", "unblock", "reset_password", "change_vinculo"].includes(action))
      return reply({ error: "Ação desconhecida" }, 400, origin);

    const memberId = String(input.member_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(memberId))
      return reply({ error: "Monitor inválido" }, 400, origin);

    const { data: target } = await admin.from("crl_members")
      .select("id,auth_user_id,username,active,monitor_vinculo,resident_id,salary_monthly")
      .eq("id", memberId).eq("institution_id", actor.institution_id).eq("role", "monitor")
      .maybeSingle();
    if (!target) return reply({ error: "Monitor não encontrado" }, 404, origin);

    if (action === "change_vinculo") {
      const vinculo = String(input.monitor_vinculo || "").trim().toLowerCase();
      const residentId=String(input.resident_id||"").trim();
      const salary=input.salary_monthly==null||input.salary_monthly===""?null:Number(input.salary_monthly);
      if(vinculo==="aluno"){
        if(!/^[0-9a-f-]{36}$/i.test(residentId))return reply({error:"Selecione um acolhido"},400,origin);
        const {data:stay}=await admin.from("crl_stays").select("id").eq("institution_id",actor.institution_id).eq("resident_id",residentId).eq("status","active").maybeSingle();
        if(!stay)return reply({error:"Acolhido não está ativo"},422,origin);
      }
      if(vinculo==="contratado"&&(!Number.isFinite(salary)||salary<=0))return reply({error:"Salário inválido"},400,origin);
      if (!["aluno","voluntario","contratado"].includes(vinculo)) return reply({ error: "Vínculo inválido" }, 400, origin);
      const { error } = await admin.from("crl_members").update({ monitor_vinculo: vinculo, resident_id:vinculo==="aluno"?residentId:null, salary_monthly:vinculo==="contratado"?salary:null })
        .eq("id", target.id).eq("institution_id", actor.institution_id).eq("role", "monitor");
      if (error) return reply({ error: "Não foi possível atualizar o vínculo" }, 500, origin);
      await admin.from("crl_audit_events").insert({
        institution_id: actor.institution_id, actor_id: auth.user.id,
        action: "monitor_link_changed", entity_name: "crl_members", entity_id: target.id,
        data: { username: target.username, previous: target.monitor_vinculo, current: vinculo }
      });
      return reply({ success: true }, 200, origin);
    }
    if (action === "block") {
      if (!target.active) return reply({ success: true, already_blocked: true }, 200, origin);
      const { error } = await admin.from("crl_members").update({ active: false })
        .eq("id", target.id).eq("institution_id", actor.institution_id).eq("role", "monitor");
      if (error) return reply({ error: "Não foi possível bloquear o acesso" }, 500, origin);
      const banned = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: "87600h" });
      await admin.from("crl_audit_events").insert({
        institution_id: actor.institution_id, actor_id: auth.user.id,
        action: "monitor_blocked", entity_name: "crl_members",
        entity_id: target.id, data: { username: target.username, auth_ban_applied: !banned.error }
      });
      return reply({ success: true, auth_ban_applied: !banned.error }, 200, origin);
    }

    if (action === "unblock") {
      if (target.active) return reply({ success: true, already_active: true }, 200, origin);
      const updated = await admin.auth.admin.updateUserById(target.auth_user_id, { ban_duration: "none" });
      if (updated.error) return reply({ error: "Não foi possível reativar o login" }, 500, origin);
      const { error: memberError } = await admin.from("crl_members")
        .update({ active: true }).eq("id", target.id).eq("institution_id", actor.institution_id).eq("role", "monitor");
      if (memberError) return reply({ error: "Login liberado, mas vínculo não pôde ser reativado. Procure o suporte." }, 500, origin);
      await admin.from("crl_audit_events").insert({
        institution_id: actor.institution_id, actor_id: auth.user.id,
        action: "monitor_unblocked", entity_name: "crl_members",
        entity_id: target.id, data: { username: target.username }
      });
      return reply({ success: true }, 200, origin);
    }

    if (!target.active) return reply({ error: "Monitor bloqueado" }, 409, origin);
    if (!strong) return reply({ error: "A nova senha precisa de 12 caracteres, maiúscula, minúscula, número e símbolo" }, 400, origin);
    const change = await admin.auth.admin.updateUserById(target.auth_user_id, { password: pwd });
    if (change.error) return reply({ error: "Não foi possível redefinir a senha" }, 500, origin);
    await admin.from("crl_audit_events").insert({
      institution_id: actor.institution_id, actor_id: auth.user.id,
      action: "monitor_password_reset", entity_name: "crl_members",
      entity_id: target.id, data: { username: target.username }
    });
    return reply({ success: true }, 200, origin);
  } catch (_error) {
    return reply({ error: "Solicitação não concluída" }, 500, origin);
  }
});
