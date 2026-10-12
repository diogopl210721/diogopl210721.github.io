// CRL - sugestão da IA para o Diário da casa.
// Recebe o texto ditado e a lista de acolhidos ativos. Antes de enviar à IA, troca os nomes por
// Acolhido A, Acolhido B... (a empresa da IA não recebe quem é quem) e devolve os nomes só na resposta.
// A IA só organiza fatos: não faz diagnóstico, não julga e não inventa. Nada é salvo aqui.
// Chave: segredo ANTHROPIC_API_KEY nas Edge Functions do Supabase. Modelo: CRL_IA_MODEL (opcional).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED = new Set(['https://www.ddsinovacao.com.br', 'https://ddsinovacao.com.br']);
const TAGS = ['positivo', 'ocorrencia', 'saude', 'familia', 'atividade', 'comportamento', 'espiritual'];
const headers = (origin: string | null) => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': origin && ALLOWED.has(origin) ? origin : 'https://www.ddsinovacao.com.br',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
});
const respond = (o: Record<string, unknown>, code = 200, origin: string | null = null) =>
  new Response(JSON.stringify(o), { status: code, headers: headers(origin) });

const isLetter = (c: string) => !!c && c.toLowerCase() !== c.toUpperCase();
// Troca todas as ocorrências de uma palavra/nome (sem diferenciar maiúsculas), só quando é palavra inteira
function swapWord(text: string, word: string, repl: string): string {
  if (!word || word.length < 2) return text;
  const low = text.toLowerCase(), w = word.toLowerCase();
  let out = '', i = 0;
  while (true) {
    const k = low.indexOf(w, i);
    if (k < 0) { out += text.slice(i); break; }
    const before = k > 0 ? text[k - 1] : '', after = text[k + w.length] || '';
    if (isLetter(before) || isLetter(after)) { out += text.slice(i, k + w.length); i = k + w.length; continue; }
    out += text.slice(i, k) + repl; i = k + w.length;
  }
  return out;
}
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const labelOf = (n: number) => 'Acolhido ' + (n < 26 ? LETTERS[n] : LETTERS[Math.floor(n / 26) - 1] + LETTERS[n % 26]);

const SYSTEM = [
  'Você ajuda a equipe de uma comunidade terapêutica a escrever o diário da casa.',
  'Recebe um texto ditado pelo monitor, com as pessoas já trocadas por códigos como «Acolhido A».',
  'Tarefa: organizar o texto em português claro e respeitoso, sem perder nenhum fato.',
  'Regras: escreva só o que foi dito; não invente; não faça diagnóstico, interpretação psicológica ou julgamento moral;',
  'não use os códigos de forma depreciativa; mantenha os códigos exatamente como vieram (ex.: Acolhido A).',
  'Separe: (1) geral: resumo do dia da casa em um ou mais parágrafos curtos;',
  '(2) acolhidos: para cada código citado, uma frase objetiva do que aconteceu com ele e as etiquetas que se aplicam.',
  'Etiquetas possíveis (use só estas chaves): positivo (destaque positivo), ocorrencia (ocorrência/conflito/regra quebrada),',
  'saude (saúde, remédio, consulta, mal-estar), familia (família, visita, ligação), atividade (trabalho, tarefa, oficina, estudo),',
  'comportamento (atitude, convivência), espiritual (culto, devocional, oração).',
  'Responda SOMENTE com JSON no formato ' + JSON.stringify({ geral: '...', acolhidos: [{ codigo: 'Acolhido A', etiquetas: ['positivo'], apontamento: '...' }] }),
].join(' ');

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido' }, 405, origin);
  if (origin && !ALLOWED.has(origin)) return respond({ error: 'Origem não permitida' }, 403, origin);
  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return respond({ error: 'Autenticação exigida' }, 401, origin);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return respond({ error: 'Serviço indisponível' }, 503, origin);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) return respond({ error: 'Sessão inválida' }, 401, origin);
    const { data: member } = await db.from('crl_members').select('institution_id,role,monitor_vinculo,active')
      .eq('auth_user_id', user.id).eq('active', true).maybeSingle();
    if (!member || (member.role !== 'admin' && member.monitor_vinculo === 'aluno')) return respond({ error: 'Acesso restrito à equipe' }, 403, origin);
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return respond({ error: 'A sugestão da IA ainda não foi ligada. O ADM precisa cadastrar a chave da IA no Supabase.' }, 503, origin);

    const body = await req.json().catch(() => null);
    const text = String(body?.text || '').trim();
    if (text.length < 10) return respond({ error: 'Dite ou escreva o que aconteceu antes de pedir a sugestão' }, 400, origin);
    if (text.length > 8000) return respond({ error: 'Texto longo demais para a sugestão (máximo 8.000 letras)' }, 400, origin);

    // Acolhidos ativos da instituição (a lista vem do banco, não do navegador)
    const { data: stays } = await db.from('crl_stays').select('id,crl_residents(full_name)')
      .eq('institution_id', member.institution_id).eq('status', 'active');
    const people = (stays || []).map((s: any, n: number) => {
      const r = Array.isArray(s.crl_residents) ? s.crl_residents[0] : s.crl_residents;
      const full = String(r?.full_name || '').trim();
      return { id: s.id, full, first: full.split(' ')[0] || '', code: labelOf(n) };
    }).filter((p: any) => p.full);
    // nomes completos primeiro; depois o primeiro nome, se só uma pessoa tiver aquele primeiro nome
    let masked = text;
    for (const p of [...people].sort((a: any, b: any) => b.full.length - a.full.length)) masked = swapWord(masked, p.full, p.code);
    for (const p of people) {
      const same = people.filter((q: any) => q.first.toLowerCase() === p.first.toLowerCase()).length;
      if (same === 1) masked = swapWord(masked, p.first, p.code);
    }

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: Deno.env.get('CRL_IA_MODEL') || 'claude-haiku-5-5',
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: 'user', content: 'Texto ditado:' + String.fromCharCode(10) + masked }],
      }),
    });
    if (!ai.ok) {
      console.error('crl-diario-ia', ai.status, (await ai.text()).slice(0, 200));
      return respond({ error: 'A IA não respondeu agora. Tente de novo em instantes ou salve sem a sugestão.' }, 502, origin);
    }
    const out = await ai.json();
    const raw = (out?.content || []).map((c: any) => c?.text || '').join('');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    let parsed: any = null;
    try { parsed = JSON.parse(raw.slice(a, b + 1)); } catch (_) { parsed = null; }
    if (!parsed || typeof parsed.geral !== 'string') return respond({ error: 'A IA respondeu fora do formato. Tente de novo.' }, 502, origin);

    // devolve os nomes
    const unmask = (s: string) => {
      let t = String(s || '');
      for (const p of [...people].sort((x: any, y: any) => y.code.length - x.code.length)) t = t.split(p.code).join(p.full);
      return t;
    };
    const entries = (Array.isArray(parsed.acolhidos) ? parsed.acolhidos : []).map((x: any) => {
      const p = people.find((q: any) => q.code === String(x?.codigo || '').trim());
      if (!p) return null;
      const tags = (Array.isArray(x?.etiquetas) ? x.etiquetas : []).map((t: any) => String(t)).filter((t: string) => TAGS.includes(t));
      return { stay_id: p.id, resident: p.full, tags: [...new Set(tags)], note: unmask(x?.apontamento || '').slice(0, 2000) };
    }).filter(Boolean);
    return respond({ general: unmask(parsed.geral).slice(0, 20000), entries }, 200, origin);
  } catch (error) {
    console.error('crl-diario-ia', String(error).slice(0, 200));
    return respond({ error: 'Não foi possível gerar a sugestão agora.' }, 500, origin);
  }
});
