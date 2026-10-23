import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Logo } from "../components/Layout";
import { Button, Notice, PinInput } from "../components/ui";
import { api, friendlyError } from "../lib/api";
import { fmtTime } from "../lib/format";
import { pinProblem } from "../lib/phone";
import { useAuth } from "../state/auth";

/** Formulário de troca de PIN (usado no primeiro acesso e em Configurações). */
export function ChangePinForm({ initialCurrent = "", onDone, compact }: { initialCurrent?: string; onDone: () => void; compact?: boolean }) {
  const { token, refreshMe } = useAuth();
  const [current, setCurrent] = useState(initialCurrent);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^\d{4}$/.test(current)) return setError("Digite o PIN atual.");
    const p = pinProblem(next);
    if (p) return setError(p);
    if (next !== confirm) return setError("A confirmação não é igual ao novo PIN.");
    if (next === current) return setError("O novo PIN precisa ser diferente do atual.");
    setBusy(true);
    try {
      const r = await api.changePin(token!, current, next);
      if (r.ok) {
        await refreshMe();
        onDone();
        return;
      }
      if (r.code === "wrong_current_pin") setError(`PIN atual incorreto.${typeof r.attempts_left === "number" ? ` Restam ${r.attempts_left} tentativa(s).` : ""}`);
      else if (r.code === "locked") setError(`Troca de PIN bloqueada temporariamente${r.locked_until ? ` até ${fmtTime(r.locked_until)}` : ""}.`);
      else if (r.code === "weak_pin") setError("PIN muito fácil. Evite sequências e números repetidos.");
      else if (r.code === "same_pin") setError("O novo PIN precisa ser diferente do atual.");
      else setError("Não foi possível trocar o PIN.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {!initialCurrent && <PinInput id="pin-cur" label="PIN atual" value={current} onChange={setCurrent} />}
      <PinInput id="pin-new" label="Novo PIN" value={next} onChange={setNext} autoFocus={!!initialCurrent} />
      <PinInput id="pin-conf" label="Confirme o novo PIN" value={confirm} onChange={setConfirm} />
      {!compact && <p className="text-xs leading-relaxed text-mute">Use 4 números que não sejam sequência (1234) nem repetidos (1111). Os outros aparelhos conectados serão desconectados.</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" loading={busy} className="h-[52px]">
        <KeyRound className="h-4 w-4" aria-hidden="true" />Salvar novo PIN
      </Button>
    </form>
  );
}

export default function ChangePin() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { currentPin?: string } };
  useEffect(() => {
    document.title = "Criar PIN · DDS Finance";
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center bg-ink px-5 pb-8 pt-10 text-white">
      <main className="flex w-full max-w-[400px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Crie seu PIN</h1>
            <p className="text-sm text-mute">Olá, {me?.profile.display_name?.split(" ")[0]}</p>
          </div>
        </div>
        <Notice tone="info">Você entrou com um PIN provisório. Crie agora o seu PIN pessoal para continuar.</Notice>
        <section className="rounded-[22px] border border-ink-700 bg-ink-800 p-6">
          <ChangePinForm initialCurrent={loc.state?.currentPin} onDone={() => navigate("/", { replace: true })} />
        </section>
      </main>
    </div>
  );
}
