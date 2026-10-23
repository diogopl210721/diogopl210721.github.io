import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, friendlyError, requestPtaxRefresh } from "../lib/api";
import { resolvePeriod, todayIn, type Period, type PeriodKey } from "../lib/dates";
import { buildTimeline, periodStats, totals, type PeriodStats, type TimelinePoint, type Totals } from "../lib/metrics";
import { getPref, setPref } from "../lib/session";
import type { DailyRow, FxData, Overview, Settings } from "../lib/types";
import { useAuth } from "./auth";

type DataState = {
  loading: boolean;
  error: string | null;
  series: DailyRow[] | null;
  overview: Overview | null;
  fx: FxData | null;
  fxRefreshing: boolean;
  settings: Settings;
  today: string;
  timeline: TimelinePoint[];
  totals: Totals;
  period: Period;
  setPeriod: (key: PeriodKey, custom?: { from: string; to: string }) => void;
  stats: PeriodStats;
  selectedDay: string;
  setSelectedDay: (d: string) => void;
  manualRate: number | null;
  setManualRate: (v: number | null) => void;
  rate: { value: number; date: string | null; source: string; simulated: boolean } | null;
  reload: () => Promise<void>;
  reloadFx: (force?: boolean) => Promise<void>;
};

const DEFAULT_SETTINGS: Settings = {
  opening_balance: 0, capital_base: null, currency: "USD", timezone: "America/Sao_Paulo",
  source_timezone: "America/Sao_Paulo", return_method: "twr",
};

const Ctx = createContext<DataState | null>(null);
const FX_STALE_MS = 30 * 60 * 1000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, me } = useAuth();
  const settings = me?.settings ?? DEFAULT_SETTINGS;
  const [series, setSeries] = useState<DailyRow[] | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [fx, setFx] = useState<FxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fxRefreshing, setFxRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodKey, setPeriodKey] = useState<PeriodKey>(() => getPref<PeriodKey>("period", "month"));
  const [custom, setCustom] = useState<{ from: string; to: string } | undefined>(() => getPref("period.custom", undefined));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [manualRate, setManualRateState] = useState<number | null>(() => getPref<number | null>("fx.manual", null));
  const fxAsked = useRef(false);

  const today = overview?.today ?? todayIn(settings.timezone);

  const reloadFx = useCallback(async (force = false) => {
    if (!token) return;
    const data = await api.fx(token);
    setFx(data);
    const last = data.last_check?.checked_at ? new Date(data.last_check.checked_at).getTime() : 0;
    if ((force || Date.now() - last > FX_STALE_MS) && !fxAsked.current) {
      fxAsked.current = true;
      setFxRefreshing(true);
      const ok = await requestPtaxRefresh();
      if (ok) setFx(await api.fx(token));
      setFxRefreshing(false);
      setTimeout(() => { fxAsked.current = false; }, 60000);
    }
  }, [token]);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [s, o] = await Promise.all([api.dailySeries(token), api.overview(token)]);
      setSeries(s);
      setOverview(o);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
    reloadFx().catch(() => { /* a tela de câmbio mostra o estado */ });
  }, [token, reloadFx]);

  useEffect(() => {
    if (token) reload();
  }, [token, reload]);

  // recarrega ao voltar para a aba (dados podem ter mudado em outro aparelho)
  useEffect(() => {
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 5 * 60 * 1000) {
        last = Date.now();
        reload();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  const timeline = useMemo(
    () => buildTimeline(series ?? [], Number(settings.opening_balance) || 0, today),
    [series, settings.opening_balance, today],
  );
  const tot = useMemo(() => totals(timeline, Number(settings.opening_balance) || 0), [timeline, settings.opening_balance]);
  const period = useMemo(() => resolvePeriod(periodKey, today, tot.firstDay, custom), [periodKey, today, tot.firstDay, custom]);
  const stats = useMemo(() => periodStats(timeline, period.from, period.to), [timeline, period]);

  const setPeriod = useCallback((key: PeriodKey, c?: { from: string; to: string }) => {
    setPeriodKey(key);
    setPref("period", key);
    if (c) {
      setCustom(c);
      setPref("period.custom", c);
    }
  }, []);

  const setManualRate = useCallback((v: number | null) => {
    setManualRateState(v);
    setPref("fx.manual", v);
  }, []);

  const rate = useMemo(() => {
    if (manualRate && manualRate > 0) return { value: manualRate, date: null, source: "Simulação manual", simulated: true };
    if (fx?.latest) return { value: Number(fx.latest.rate), date: fx.latest.rate_date, source: "Banco Central do Brasil (PTAX)", simulated: false };
    return null;
  }, [manualRate, fx]);

  const value: DataState = {
    loading, error, series, overview, fx, fxRefreshing, settings, today, timeline, totals: tot, period, setPeriod, stats,
    selectedDay: selectedDay ?? today, setSelectedDay, manualRate, setManualRate, rate, reload, reloadFx,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData fora do DataProvider");
  return v;
}
