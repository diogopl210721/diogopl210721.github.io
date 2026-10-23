import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Logo } from "../components/Layout";
import { Button, Field, Notice, PinInput } from "../components/ui";
import { friendlyError } from "../lib/api";
import { fmtTime } from "../lib/format";
import { maskBrPhone, normalizePhone } from "../lib/phone";
import { getPref, setPref } from "../lib/session";
import { useAuth } from "../state/auth";

export default function Login() {
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => getPref<string>("last-phone", ""));
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Entrar · DDS Finance";
  }, []);

  async function submit(pinValue = pin) {
    setError(null);
    const norm = normalizePhone(phone);
    if (!norm) return setError("Informe o telefone com DDD, por exemplo (41) 99999-9999.");
    if (!/^\d{4}$/.test(pinValue)) return setError("Digite os 4 números do PIN.");
    setBusy(true);
    try {
      const r = await login(phone, pinValue, remember);
      if (r.ok) {
        setPref("last-phone", maskBrPhone(norm.slice(2)));
        clearNotice();
        navigate(r.must_change_pin ? "/trocar-pin" : "/", { replace: true, state: r.must_change_pin ? { currentPin: pinValue } : undefined });
        return;
      }
      setPin("");
      if (r.code === "locked") {
        setError(`Acesso bloqueado temporariamente por excesso de tentativas. Tente de novo ${r.locked_until ? `às ${fmtTime(r.locked_until)}` : "mais tarde"}.`);
      } else if (r.code === "too_many_attempts") {
        setError(`Muitas tentativas a partir desta conexão. Tente de novo ${r.locked_until ? `às ${fmtTime(r.locked_until)}` : "em alguns minutos"}.`);
      } else {
        const left = typeof r.attempts_left === "number" ? r.attempts_left : null;
        setError(`Telefone ou PIN incorretos.${left != null && left <= 3 ? ` Restam ${left} tentativa(s) antes do bloqueio temporário.` : ""}`);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-ink px-5 pb-8 pt-14 text-white">
      <main className="flex w-full max-w-[400px] flex-1 flex-col gap-8">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <Logo size={64} />
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight">DDS Finance</h1>
            <p className="mt-1 text-sm text-mute">Seu trading em números reais</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-5 rounded-[22px] border border-ink-700 bg-ink-800 p-6"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          noValidate
        >
          <h2 className="text-xl font-extrabold">Entrar</h2>
          {notice && <Notice tone="info" onClose={clearNotice}>{notice}</Notice>}

          <Field label="Telefone" htmlFor="tel">
            <div className="flex h-[52px] items-center overflow-hidden rounded-2xl border border-ink-500 bg-ink-850 focus-within:border-sky">
              <span className="flex h-full items-center border-r border-ink-500 px-3 text-[15px] font-bold text-mute-strong">+55</span>
              <input
                id="tel"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={(e) => setPhone(maskBrPhone(e.target.value))}
                className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-base outline-none placeholder:text-ink-400"
                required
              />
            </div>
          </Field>

          <div className="flex flex-col gap-2">
            <PinInput id="pin" label="PIN de 4 dígitos" value={pin} onChange={setPin} invalid={!!error && pin.length === 0}
              onComplete={(v) => { if (normalizePhone(phone)) submit(v); }} />
            <p className="text-xs leading-relaxed text-mute">Após 5 erros seguidos o acesso é bloqueado por um tempo crescente.</p>
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-mute-strong">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="h-5 w-5 rounded border-ink-500 bg-ink-850 accent-[#54E6C1]" />
            Manter conectado neste aparelho
          </label>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" variant="primary" loading={busy} className="h-[54px] text-base">
            {busy ? "Entrando…" : "Entrar"}
          </Button>

          <div className="flex justify-between text-sm font-semibold">
            <Link to="/recuperar" className="flex min-h-[44px] items-center text-sky hover:text-white">Esqueci meu PIN</Link>
            <Link to="/recuperar?novo=1" className="flex min-h-[44px] items-center text-sky hover:text-white">Pedir acesso</Link>
          </div>
        </form>

        <div className="mt-auto flex items-center justify-center gap-2 text-xs text-mute">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Cada conta enxerga somente os próprios dados
        </div>
      </main>
    </div>
  );
}
