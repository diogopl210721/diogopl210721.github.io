import { useState, type ReactNode } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight, CalendarRange, ChevronDown, FileClock, KeyRound, LayoutGrid, List, LogOut, MoreHorizontal,
  Settings as SettingsIcon, ShieldCheck, Upload, Wallet, MonitorSmartphone,
} from "lucide-react";
import { useAuth } from "../state/auth";
import { useData } from "../state/data";
import { PERIOD_LABELS, type PeriodKey } from "../lib/dates";
import { fmtDate, fmtDateTime, relativeFromNow } from "../lib/format";
import { formatPhone } from "../lib/phone";
import { Button, cx, Field, inputCls, Segmented, Sheet } from "./ui";

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-[10px] bg-pos" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#080F1D" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="15 7 21 7 21 13" />
      </svg>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Visão geral", Icon: LayoutGrid, end: true },
  { to: "/movimentacoes", label: "Movimentações", Icon: List },
  { to: "/importar", label: "Importar arquivo", Icon: Upload },
  { to: "/importacoes", label: "Histórico de importações", Icon: FileClock },
  { to: "/capital", label: "Capital e rentabilidade", Icon: Wallet },
  { to: "/cambio", label: "Cotação cambial", Icon: ArrowLeftRight },
  { to: "/configuracoes", label: "Configurações", Icon: SettingsIcon },
];

function initials(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export function LastImport({ compact }: { compact?: boolean }) {
  const { overview, settings } = useData();
  const li = overview?.last_import;
  if (!li) {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-mute">
        <span className="h-2 w-2 rounded-full bg-ink-400" aria-hidden="true" />
        Nenhuma importação ainda
      </span>
    );
  }
  const when = li.completed_at ?? li.created_at;
  const ok = li.status === "completed";
  const failed = li.status === "failed";
  return (
    <Link to="/importacoes" className="inline-flex min-h-[32px] items-center gap-2 text-[13px] text-mute hover:text-mute-strong"
      title={`Última importação em ${fmtDateTime(when, settings.timezone)}`}>
      <span className={cx("h-2 w-2 rounded-full", failed ? "bg-neg" : ok ? "bg-pos" : "bg-amber-300")} aria-hidden="true" />
      <span>
        {compact ? "Importado " : "Última importação "}
        {relativeFromNow(when)}
        {!compact && ` · ${overview?.transactions_total?.toLocaleString("pt-BR") ?? 0} movimentações`}
        {failed && " (falhou)"}
      </span>
    </Link>
  );
}

export function PeriodSelector({ size = "md" }: { size?: "sm" | "md" }) {
  const { period, setPeriod } = useData();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const keys: PeriodKey[] = ["today", "7d", "month", "prev_month", "year", "all", "custom"];
  return (
    <>
      <Segmented<PeriodKey>
        label="Período"
        size={size}
        value={period.key}
        options={keys.map((k) => ({ value: k, label: k === "custom" && period.key === "custom" ? `${fmtDate(period.from).slice(0, 5)}–${fmtDate(period.to).slice(0, 5)}` : PERIOD_LABELS[k] }))}
        onChange={(k) => {
          if (k === "custom") {
            setFrom(period.from);
            setTo(period.to);
            setOpen(true);
          } else setPeriod(k);
        }}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title="Período personalizado">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) {
              setPeriod("custom", { from, to });
              setOpen(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="De" htmlFor="pf-from">
              <input id="pf-from" type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} required />
            </Field>
            <Field label="Até" htmlFor="pf-to">
              <input id="pf-to" type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required />
            </Field>
          </div>
          <Button type="submit" variant="primary"><CalendarRange className="h-4 w-4" aria-hidden="true" />Aplicar período</Button>
        </form>
      </Sheet>
    </>
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const go = (to: string) => { onClose(); navigate(to); };
  if (!me) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Perfil e segurança">
      <div className="flex items-center gap-3 pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1E3A5F] text-base font-bold text-sky">{initials(me.profile.display_name)}</div>
        <div className="min-w-0">
          <div className="truncate font-bold">{me.profile.display_name}</div>
          <div className="text-sm text-mute">{formatPhone(me.profile.phone)}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button className="justify-start" onClick={() => go("/configuracoes#pin")}><KeyRound className="h-4 w-4" aria-hidden="true" />Trocar PIN</Button>
        <Button className="justify-start" onClick={() => go("/configuracoes")}><SettingsIcon className="h-4 w-4" aria-hidden="true" />Configurações e privacidade</Button>
        {me.profile.is_admin && (
          <Button className="justify-start" onClick={() => go("/admin")}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Administração de acessos</Button>
        )}
        <Button className="justify-start" onClick={() => { onClose(); logout(false); }}><LogOut className="h-4 w-4" aria-hidden="true" />Sair deste aparelho</Button>
        <Button variant="danger" className="justify-start" onClick={() => { onClose(); logout(true); }}>
          <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />Sair de todos os aparelhos
        </Button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-mute">
        {me.active_sessions} sessão(ões) ativa(s). Esta sessão vale até {fmtDateTime(me.session.expires_at, me.settings.timezone)}
        {" "}e é renovada enquanto você usa o app.
      </p>
    </Sheet>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const items = [
    { to: "/importacoes", label: "Histórico de importações", Icon: FileClock },
    { to: "/cambio", label: "Cotação cambial", Icon: ArrowLeftRight },
    { to: "/configuracoes", label: "Configurações", Icon: SettingsIcon },
    ...(me?.profile.is_admin ? [{ to: "/admin", label: "Administração", Icon: ShieldCheck }] : []),
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Mais opções">
      <nav aria-label="Mais opções" className="flex flex-col gap-2">
        {items.map(({ to, label, Icon }) => (
          <Button key={to} className="justify-start" onClick={() => { onClose(); navigate(to); }}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </Button>
        ))}
        <Button className="justify-start" onClick={() => { onClose(); logout(false); }}><LogOut className="h-4 w-4" aria-hidden="true" />Sair</Button>
      </nav>
    </Sheet>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  const name = me?.profile.display_name ?? "";
  const nav = me?.profile.is_admin ? [...NAV, { to: "/admin", label: "Administração", Icon: ShieldCheck }] : NAV;
  const mobileTabs = [
    { to: "/", label: "Visão geral", Icon: LayoutGrid, end: true },
    { to: "/movimentacoes", label: "Movimentos", Icon: List },
    { to: "/capital", label: "Capital", Icon: Wallet },
  ];
  const showPeriod = loc.pathname === "/" || loc.pathname.startsWith("/capital");

  return (
    <div className="min-h-screen bg-ink text-white lg:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2 focus:text-ink">
        Pular para o conteúdo
      </a>

      {/* menu lateral (computador) */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-6 border-r border-ink-700 bg-ink-850 px-4 py-6 lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2" aria-label="DDS Finance — visão geral">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">DDS Finance</span>
        </Link>
        <nav aria-label="Menu principal" className="flex flex-col gap-1">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx("flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm",
                isActive ? "bg-ink-750 font-bold text-white" : "font-semibold text-mute-strong hover:bg-ink-800")}>
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-ink-700 bg-ink-800 p-3.5 text-xs leading-relaxed text-mute">
          <div className="text-[13px] font-bold text-white">Moeda de referência: USD</div>
          Conversão para reais pela PTAX do Banco Central, apenas indicativa.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* cabeçalho */}
        <header className="sticky top-0 z-30 border-b border-ink-700/70 bg-ink/90 backdrop-blur supports-[backdrop-filter]:bg-ink/75">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <Link to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="DDS Finance — visão geral">
              <Logo size={34} />
              <span className="flex flex-col leading-tight">
                <span className="text-[16px] font-extrabold tracking-tight">DDS Finance</span>
                <span className="text-xs text-mute">{name}</span>
              </span>
            </Link>
            <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
              {showPeriod ? <PeriodSelector size="sm" /> : <LastImport />}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden xl:block">{showPeriod && <LastImport compact />}</div>
              <Link to="/importar"
                className="hidden min-h-[44px] items-center gap-2 rounded-2xl bg-pos px-4 text-sm font-extrabold text-ink hover:brightness-105 sm:inline-flex">
                <Upload className="h-4 w-4" aria-hidden="true" />Importar CSV
              </Link>
              <Link to="/importar" aria-label="Importar arquivo"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 sm:hidden">
                <Upload className="h-5 w-5" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => setProfileOpen(true)} aria-label={`Perfil e segurança de ${name}`}
                className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-ink-700 bg-ink-800 p-1 sm:pr-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1E3A5F] text-[13px] font-bold text-sky">{initials(name)}</span>
                <span className="hidden max-w-[140px] truncate text-sm font-bold sm:inline">{name.split(" ")[0]}</span>
                <ChevronDown className="hidden h-4 w-4 text-mute sm:inline" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-6">
          {children}
        </main>
      </div>

      {/* navegação inferior (celular e tablet) */}
      <nav aria-label="Menu principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-850/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-around px-2 pt-2 pb-2">
          {mobileTabs.slice(0, 2).map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => cx("flex min-h-[48px] w-16 flex-col items-center justify-center gap-1 text-[11px]",
                isActive ? "font-bold text-white" : "font-semibold text-mute")}>
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />{label}
            </NavLink>
          ))}
          <Link to="/importar" aria-label="Importar arquivo"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-[18px] bg-pos text-ink shadow-[0_8px_24px_-8px_rgba(84,230,193,0.6)]">
            <Upload className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
          </Link>
          {mobileTabs.slice(2).map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => cx("flex min-h-[48px] w-16 flex-col items-center justify-center gap-1 text-[11px]",
                isActive ? "font-bold text-white" : "font-semibold text-mute")}>
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />{label}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)}
            className="flex min-h-[48px] w-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-mute">
            <MoreHorizontal className="h-[22px] w-[22px]" aria-hidden="true" />Mais
          </button>
        </div>
      </nav>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-[26px]">{title}</h1>
        {sub && <div className="mt-1 text-[13px] text-mute">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
