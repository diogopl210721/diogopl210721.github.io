import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, UserPlus } from "lucide-react";
import { Copyright, Logo } from "../components/Layout";
import { Button, Field, inputCls, Notice, PinInput } from "../components/ui";
import { friendlyError } from "../lib/api";
import { fmtTime } from "../lib/format";
import { maskBrPhone, normalizePhone, pinProblem } from "../lib/phone";
import { setPref } from "../lib/session";
import { useAuth } from "../state/auth";

/** Campo de telefone com o +55 fixo, igual ao do login. */
function PhoneInput({ id, value, onChange, invalid, autoComplete }: {
  id: string; value: string; onChange: (v: string) => void; invalid?: boolean; autoComplete?: string;
}) {
  return (
    <div className={`flex h-[52px] items-center overflow-hidden rounded-2xl border bg-ink-850 focus-within:border-sky ${invalid ? "border-neg" : "border-ink-500"}`}>
      <span className="flex h-full items-center border-r border-ink-500 px-3 text-[15px] font-bold text-mute-strong">+55</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete ?? "off"}
        placeholder="(00) 00000-0000"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(maskBrPhone(e.target.value))}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-base outline-none placeholder:text-ink-400"
        required
      />
    </div>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);

  useEffect(() => {
    document.title = "Criar conta · DDS Finance";
  }, []);

  const n1 = normalizePhone(phone);
  const n2 = normalizePhone(phone2);
  // avisos enquanto digita: só depois que o segundo campo estiver completo
  const phoneMismatch = !!n1 && !!n2 && n1 !== n2;
  const pinMismatch = pin.length === 4 && pin2.length === 4 && pin !== pin2;

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Informe o seu nome.");
    if (name.trim().length > 80) return setError("O nome pode ter até 80 caracteres.");
    if (!n1) return setError("Informe o telefone com DDD, por exemplo (41) 99999-9999.");
    if (!n2) return setError("Digite o telefone de novo no campo de confirmação.");
    if (n1 !== n2) return setError("Os dois telefones não são iguais. Confira os números.");
    const p = pinProblem(pin);
    if (p) return setError(p);
    if (pin2.length !== 4) return setError("Digite o PIN de novo no campo de confirmação.");
    if (pin !== pin2) return setError("Os dois PINs não são iguais. Digite de novo.");
    setBusy(true);
    try {
      const r = await register(name.trim(), phone, pin, remember);
      if (r.ok) {
        setPref("last-phone", maskBrPhone(n1.slice(2)));
        navigate("/", { replace: true });
        return;
      }
      if (r.code === "phone_in_use") {
        setError(<>Já existe uma conta com esse telefone. <Link to="/login" className="font-bold text-white underline">Entre com seu PIN</Link> ou use <Link to="/recuperar" className="font-bold text-white underline">Esqueci meu PIN</Link>.</>);
      } else if (r.code === "weak_pin") {
        setPin(""); setPin2("");
        setError("PIN muito fácil. Evite sequências (1234) e números repetidos (1111).");
      } else if (r.code === "too_many_attempts") {
        setError(`Muitos cadastros a partir desta conexão. Tente de novo ${r.locked_until ? `às ${fmtTime(r.locked_until)}` : "mais tarde"}.`);
      } else if (r.code === "invalid_phone") {
        setError("Telefone inválido. Use DDD + número.");
      } else if (r.code === "invalid_name") {
        setError("Informe um nome com até 80 caracteres.");
      } else {
        setError("Não foi possível criar a conta. Tente de novo.");
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-ink px-5 pb-8 pt-10 text-white">
      <main className="flex w-full max-w-[400px] flex-1 flex-col gap-6">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Criar conta</h1>
            <p className="text-sm text-mute">DDS Finance · leva menos de um minuto</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-5 rounded-[22px] border border-ink-700 bg-ink-800 p-6"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          noValidate
        >
          <Field label="Seu nome" htmlFor="reg-name">
            <input id="reg-name" type="text" autoComplete="name" maxLength={80} className={inputCls}
              value={name} onChange={(e) => setName(e.target.value)} placeholder="Como quer ser chamado" />
          </Field>

          <Field label="Telefone" htmlFor="reg-tel">
            <PhoneInput id="reg-tel" value={phone} onChange={setPhone} autoComplete="tel-national" />
          </Field>
          <Field label="Confirme o telefone" htmlFor="reg-tel2" error={phoneMismatch ? "Os telefones não são iguais." : undefined}>
            <PhoneInput id="reg-tel2" value={phone2} onChange={setPhone2} invalid={phoneMismatch} />
          </Field>

          <PinInput id="reg-pin" label="Crie um PIN de 4 dígitos" value={pin} onChange={setPin} />
          <div className="flex flex-col gap-1.5">
            <PinInput id="reg-pin2" label="Confirme o PIN" value={pin2} onChange={setPin2} invalid={pinMismatch} />
            {pinMismatch
              ? <p className="text-xs font-semibold text-neg" role="alert">Os PINs não são iguais.</p>
              : <p className="text-xs leading-relaxed text-mute">Evite sequências (1234) e números repetidos (1111). Depois você pode trocar o PIN em Configurações.</p>}
          </div>

          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-mute-strong">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="h-5 w-5 rounded border-ink-500 bg-ink-850 accent-[#54E6C1]" />
            Manter conectado neste aparelho
          </label>

          {error && <Notice tone="error">{error}</Notice>}

          <Button type="submit" variant="primary" loading={busy} className="h-[54px] text-base">
            <UserPlus className="h-5 w-5" aria-hidden="true" />{busy ? "Criando…" : "Criar conta"}
          </Button>

          <p className="text-center text-sm text-mute">
            Já tem conta? <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-sky hover:text-white">Entrar</Link>
          </p>
        </form>

        <div className="mt-auto flex items-center justify-center gap-2 text-xs text-mute">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Cada conta enxerga somente os próprios dados
        </div>
        <Copyright />
      </main>
    </div>
  );
}
