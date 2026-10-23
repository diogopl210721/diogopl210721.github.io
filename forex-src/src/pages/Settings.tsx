import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, KeyRound, LogOut, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { PageTitle } from "../components/Layout";
import { Button, Card, CardHeader, Field, inputCls, Notice, PinInput, Sheet } from "../components/ui";
import { APP_VERSION } from "../config";
import { api, friendlyError } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { formatPhone } from "../lib/phone";
import { download, toCsv } from "../lib/report";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";
import { ChangePinForm } from "./ChangePin";

const ZONES = [
  "America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife",
  "America/Noronha", "America/Rio_Branco", "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/Lisbon", "Europe/London", "Europe/Madrid", "UTC",
];

export default function SettingsPage() {
  const { token, me, setProfile, setSettings, logout } = useAuth();
  const data = useData();
  const loc = useLocation();
  const s = data.settings;
  const [name, setName] = useState(me?.profile.display_name ?? "");
  const [tz, setTz] = useState(s.timezone);
  const [srcTz, setSrcTz] = useState(s.source_timezone);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error" | "info"; text: string; area: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [delDataOpen, setDelDataOpen] = useState(false);
  const [delAccOpen, setDelAccOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [delPin, setDelPin] = useState("");

  useEffect(() => {
    document.title = "Configurações · DDS Finance";
    if (loc.hash === "#pin") setPinOpen(true);
  }, [loc.hash]);

  const say = (area: string, tone: "ok" | "error" | "info", text: string) => setMsg({ area, tone, text });
  const msgFor = (area: string) => (msg?.area === area ? <Notice tone={msg.tone}>{msg.text}</Notice> : null);

  async function saveProfile() {
    setBusy("profile");
    try {
      const p = await api.updateProfile(token!, name);
      setProfile(p);
      say("profile", "ok", "Nome atualizado.");
    } catch (e) {
      say("profile", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveZones() {
    setBusy("tz");
    try {
      const ns = await api.updateSettings(token!, { ...s, timezone: tz, source_timezone: srcTz });
      setSettings(ns);
      await data.reload();
      say("tz", "ok", "Fusos salvos. Os dias foram reagrupados.");
    } catch (e) {
      say("tz", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportJson() {
    setBusy("export");
    try {
      const all = await api.exportMyData(token!);
      download(`dds-finance-meus-dados-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all, null, 2), "application/json");
      say("export", "ok", "Exportação gerada.");
    } catch (e) {
      say("export", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setBusy("export");
    try {
      const all = (await api.exportMyData(token!)) as { transactions: Array<Record<string, unknown>> };
      const cols = ["external_transaction_id", "reason", "classification", "currency", "amount", "amount_profit", "op_result", "capital_flow", "time_raw", "transaction_time"];
      const csv = toCsv(cols, all.transactions.map((t) => cols.map((c) => t[c])));
      download(`dds-finance-movimentacoes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      say("export", "ok", `${all.transactions.length} movimentações exportadas.`);
    } catch (e) {
      say("export", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteData() {
    setBusy("deldata");
    try {
      const r = await api.deleteFinancialData(token!);
      setDelDataOpen(false);
      setConfirmText("");
      await data.reload();
      say("danger", "ok", `${r.transactions_deleted} movimentações e ${r.import_jobs_deleted} importações apagadas.`);
    } catch (e) {
      say("danger", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delacc");
    try {
      const r = await api.deleteAccount(token!, delPin);
      if (r.ok) {
        setDelAccOpen(false);
        await logout(false);
        return;
      }
      setDelPin("");
      say("delacc", "error", r.code === "wrong_pin" ? `PIN incorreto.${typeof r.attempts_left === "number" ? ` Restam ${r.attempts_left} tentativa(s).` : ""}`
        : r.code === "locked" ? "Bloqueado temporariamente por tentativas erradas."
        : r.code === "last_admin" ? "Você é o único administrador. Crie outro administrador antes de excluir sua conta." : "Não foi possível excluir.");
    } catch (e) {
      say("delacc", "error", friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageTitle title="Configurações" />

      <Card className="flex flex-col gap-4 p-5" aria-labelledby="h-prof">
        <CardHeader id="h-prof" title="Conta" />
        <div className="flex items-center gap-3 text-sm">
          <UserRound className="h-5 w-5 text-mute" aria-hidden="true" />
          <span>Telefone de acesso: <strong>{formatPhone(me?.profile.phone)}</strong></span>
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); saveProfile(); }}>
          <div className="min-w-[220px] flex-1">
            <Field label="Nome exibido" htmlFor="st-name">
              <input id="st-name" className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" loading={busy === "profile"}><Save className="h-4 w-4" aria-hidden="true" />Salvar nome</Button>
        </form>
        {msgFor("profile")}
      </Card>

      <Card className="flex flex-col gap-4 p-5" aria-labelledby="h-sec">
        <CardHeader id="h-sec" title="Segurança" sub="PIN guardado com hash irreversível; bloqueio progressivo após tentativas erradas" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPinOpen(true)}><KeyRound className="h-4 w-4" aria-hidden="true" />Trocar PIN</Button>
          <Button onClick={() => logout(true)}><LogOut className="h-4 w-4" aria-hidden="true" />Sair de todos os aparelhos</Button>
        </div>
        <p className="text-xs text-mute">
          {me?.active_sessions ?? 1} sessão(ões) ativa(s). Esta vale até {fmtDateTime(me?.session.expires_at, s.timezone)} e é renovada enquanto você usa o app.
        </p>
      </Card>

      <Card className="flex flex-col gap-4 p-5" aria-labelledby="h-tz">
        <CardHeader id="h-tz" title="Datas e fuso horário" sub="Define em que dia cada movimentação é contada" />
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveZones(); }}>
          <Field label="Fuso do arquivo" htmlFor="st-src" hint="Como interpretar a coluna Time (o arquivo não informa o fuso). Confirmado: horário de Brasília.">
            <select id="st-src" className={inputCls} value={srcTz} onChange={(e) => setSrcTz(e.target.value)}>
              {[...new Set([srcTz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="Fuso para agrupar os dias" htmlFor="st-tz" hint="O dia de cada resultado é calculado neste fuso.">
            <select id="st-tz" className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)}>
              {[...new Set([tz, ...ZONES])].map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
          <div className="flex flex-col gap-3 sm:col-span-2">
            {msgFor("tz")}
            <Button type="submit" loading={busy === "tz"} className="self-start"><Save className="h-4 w-4" aria-hidden="true" />Salvar fusos</Button>
          </div>
        </form>
      </Card>

      <Card className="flex flex-col gap-4 p-5" aria-labelledby="h-lgpd">
        <CardHeader id="h-lgpd" title="Privacidade e seus dados (LGPD)" />
        <div className="text-sm leading-relaxed text-mute-strong">
          <p>Seus dados ficam no banco do DDS Finance (Supabase) e só são acessíveis com a sua sessão. O administrador cria acessos e redefine PINs, mas não vê seus dados financeiros pelo app.</p>
          <p className="mt-2">O arquivo CSV é lido no seu aparelho; só as linhas (com os valores originais, para auditoria) são enviadas ao servidor. O arquivo em si não é guardado.</p>
          <p className="mt-2">Registros de segurança (logins, importações, trocas de PIN) não guardam PIN nem valores financeiros.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson} loading={busy === "export"}><Download className="h-4 w-4" aria-hidden="true" />Exportar tudo (JSON)</Button>
          <Button onClick={exportCsv} loading={busy === "export"}><Download className="h-4 w-4" aria-hidden="true" />Exportar movimentações (CSV)</Button>
        </div>
        {msgFor("export")}
        <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-neg/30 p-4">
          <div className="font-bold text-neg">Zona de exclusão</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => setDelDataOpen(true)}><Trash2 className="h-4 w-4" aria-hidden="true" />Apagar meus dados financeiros</Button>
            <Button variant="danger" onClick={() => setDelAccOpen(true)}><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir minha conta</Button>
          </div>
          {msgFor("danger")}
        </div>
      </Card>

      <Card className="p-5 text-xs leading-relaxed text-mute" aria-label="Sobre">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-4 w-4 text-pos" aria-hidden="true" />DDS Finance {APP_VERSION}</div>
        <p className="mt-1">Moeda de referência USD · cotação PTAX do Banco Central · classificação das movimentações versão 1.</p>
      </Card>

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Trocar PIN">
        <ChangePinForm onDone={() => { setPinOpen(false); say("profile", "ok", "PIN alterado. Outros aparelhos foram desconectados."); }} />
      </Sheet>

      <Sheet open={delDataOpen} onClose={() => setDelDataOpen(false)} title="Apagar dados financeiros">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (confirmText === "EXCLUIR") deleteData(); }}>
          <Notice tone="error" title="Não dá para desfazer">Todas as movimentações e o histórico de importações serão apagados. Seu acesso continua. Faça a exportação antes, se quiser guardar.</Notice>
          <Field label='Digite EXCLUIR para confirmar' htmlFor="del-confirm">
            <input id="del-confirm" className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value.toUpperCase())} autoComplete="off" />
          </Field>
          <Button type="submit" variant="danger" disabled={confirmText !== "EXCLUIR"} loading={busy === "deldata"}>Apagar definitivamente</Button>
        </form>
      </Sheet>

      <Sheet open={delAccOpen} onClose={() => setDelAccOpen(false)} title="Excluir conta">
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (delPin.length === 4) deleteAccount(); }}>
          <Notice tone="error" title="Não dá para desfazer">Sua conta, movimentações, importações e configurações serão apagadas e você sairá do app.</Notice>
          <PinInput id="del-pin" label="Confirme com seu PIN" value={delPin} onChange={setDelPin} />
          {msgFor("delacc")}
          <Button type="submit" variant="danger" disabled={delPin.length !== 4} loading={busy === "delacc"}>Excluir minha conta</Button>
        </form>
      </Sheet>
    </div>
  );
}
