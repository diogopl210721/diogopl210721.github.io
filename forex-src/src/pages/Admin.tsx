import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Copy, KeyRound, Lock, UserPlus, UserX, UserCheck } from "lucide-react";
import { PageTitle } from "../components/Layout";
import { Badge, Button, Card, CardHeader, Field, inputCls, Notice, Sheet, Skeleton } from "../components/ui";
import { api, friendlyError } from "../lib/api";
import { fmtDateTime, fmtInt } from "../lib/format";
import { formatPhone, maskBrPhone, normalizePhone } from "../lib/phone";
import type { AdminUser } from "../lib/types";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";

function TempPin({ pin, who, onClose }: { pin: string; who: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet open onClose={onClose} title="PIN provisório">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-mute-strong">Passe este PIN para <strong className="text-white">{who}</strong> por um canal seguro. Ele aparece só agora.</p>
        <div className="font-mono text-5xl font-extrabold tracking-[0.3em] text-pos" aria-live="polite">{pin}</div>
        <Button onClick={() => navigator.clipboard?.writeText(pin).then(() => setCopied(true)).catch(() => undefined)}>
          <Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Copiado" : "Copiar PIN"}
        </Button>
        <p className="text-xs leading-relaxed text-mute">No primeiro acesso a pessoa cria o PIN definitivo. Sessões antigas dela foram encerradas.</p>
        <Button variant="primary" className="w-full" onClick={onClose}>Pronto</Button>
      </div>
    </Sheet>
  );
}

export default function Admin() {
  const { token, me } = useAuth();
  const { settings } = useData();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ pin: string; who: string } | null>(null);

  const load = () => token && api.adminListUsers(token).then(setUsers).catch((e) => setError(friendlyError(e)));
  useEffect(() => {
    document.title = "Administração · DDS Finance";
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (me && !me.profile.is_admin) return <Navigate to="/" replace />;

  async function create() {
    setError(null);
    if (!normalizePhone(phone)) return setError("Telefone inválido. Use DDD + número.");
    if (!name.trim()) return setError("Informe o nome.");
    setBusy("create");
    try {
      const r = await api.adminCreateUser(token!, name.trim(), phone, asAdmin);
      setCreateOpen(false);
      setTemp({ pin: r.temp_pin, who: name.trim() });
      setName(""); setPhone(""); setAsAdmin(false);
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function reset(u: AdminUser) {
    setBusy("reset:" + u.id);
    try {
      const r = await api.adminResetPin(token!, u.id);
      setTemp({ pin: r.temp_pin, who: u.display_name });
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(u: AdminUser) {
    setBusy("act:" + u.id);
    try {
      await api.adminSetActive(token!, u.id, !u.is_active);
      load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageTitle title="Administração de acessos" sub="Criar acessos, redefinir PIN e desativar usuários. Dados financeiros não aparecem aqui."
        right={<Button variant="primary" onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" aria-hidden="true" />Novo acesso</Button>} />
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {!users && <div className="flex flex-col gap-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {users && (
        <ul className="flex flex-col gap-2.5">
          {users.map((u) => (
            <li key={u.id}>
              <Card as="div" className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold">{u.display_name}{u.id === me?.profile.id && <span className="text-mute"> (você)</span>}</div>
                    <div className="text-sm text-mute">{formatPhone(u.phone)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.is_admin && <Badge>ADMIN</Badge>}
                    {!u.is_active && <Badge tone="neg">desativado</Badge>}
                    {u.must_change_pin && <Badge tone="warn">PIN provisório</Badge>}
                    {u.locked_until && <Badge tone="neg"><Lock className="h-3 w-3" aria-hidden="true" />bloqueado</Badge>}
                  </div>
                </div>
                <div className="text-xs text-mute">
                  Último acesso: {u.last_login_at ? fmtDateTime(u.last_login_at, settings.timezone) : "nunca"} · {fmtInt(u.transactions)} movimentações · criado em {fmtDateTime(u.created_at, settings.timezone).slice(0, 10)}
                </div>
                {u.id !== me?.profile.id && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => reset(u)} loading={busy === "reset:" + u.id}><KeyRound className="h-4 w-4" aria-hidden="true" />{u.locked_until ? "Desbloquear e redefinir PIN" : "Redefinir PIN"}</Button>
                    <Button variant={u.is_active ? "danger" : "secondary"} onClick={() => toggle(u)} loading={busy === "act:" + u.id}>
                      {u.is_active ? <><UserX className="h-4 w-4" aria-hidden="true" />Desativar</> : <><UserCheck className="h-4 w-4" aria-hidden="true" />Reativar</>}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="p-4 text-sm leading-relaxed text-mute-strong">
        <CardHeader title="Recuperação de acesso" />
        <p className="mt-2">Quando alguém esquecer o PIN, confirme a identidade da pessoa (ligação ou conversa pelo número cadastrado) antes de redefinir. O PIN provisório vale só para o próximo acesso.</p>
      </Card>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Novo acesso">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <Field label="Nome" htmlFor="ad-name"><input id="ad-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-autofocus /></Field>
          <Field label="Telefone (com DDD)" htmlFor="ad-phone" hint="Para número de fora do Brasil, comece com + e o código do país.">
            <input id="ad-phone" type="tel" inputMode="tel" className={inputCls} value={phone}
              onChange={(e) => setPhone(e.target.value.trim().startsWith("+") ? e.target.value : maskBrPhone(e.target.value))} placeholder="(41) 99999-9999" />
          </Field>
          <label className="flex min-h-[44px] items-center gap-3 text-sm">
            <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} className="h-5 w-5 accent-[#54E6C1]" />
            Também é administrador
          </label>
          <Button type="submit" variant="primary" loading={busy === "create"}>Criar e gerar PIN provisório</Button>
        </form>
      </Sheet>
      {temp && <TempPin pin={temp.pin} who={temp.who} onClose={() => setTemp(null)} />}
    </div>
  );
}
