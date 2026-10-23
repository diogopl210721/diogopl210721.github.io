import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, onAuthExpired } from "../lib/api";
import { clearSession, loadSession, saveSession } from "../lib/session";
import type { LoginResult, Me, Profile, Settings } from "../lib/types";

type AuthState = {
  status: "loading" | "anon" | "authed";
  token: string | null;
  me: Me | null;
  notice: string | null;
  login: (phone: string, pin: string, remember: boolean) => Promise<LoginResult>;
  logout: (all?: boolean) => Promise<void>;
  refreshMe: () => Promise<void>;
  setProfile: (p: Profile) => void;
  setSettings: (s: Settings) => void;
  clearNotice: () => void;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = useCallback((msg?: string) => {
    clearSession();
    setToken(null);
    setMe(null);
    setStatus("anon");
    if (msg) setNotice(msg);
  }, []);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      setStatus("anon");
      return;
    }
    api.me(s.token)
      .then((m) => {
        setToken(s.token);
        setMe(m);
        saveSession({ ...s, expiresAt: m.session.expires_at ?? s.expiresAt });
        setStatus("authed");
      })
      .catch((e) => {
        if (e instanceof ApiError && e.isAuth) reset("Sua sessão expirou. Entre novamente.");
        else {
          // sem rede: mantém a sessão salva e tenta de novo depois
          setToken(s.token);
          setStatus("authed");
        }
      });
  }, [reset]);

  useEffect(() => onAuthExpired(() => reset("Sua sessão expirou. Entre novamente.")), [reset]);

  const login = useCallback(async (phone: string, pin: string, remember: boolean) => {
    const r = await api.login(phone, pin, remember);
    if (r.ok && r.token) {
      saveSession({ token: r.token, expiresAt: r.expires_at ?? "", remember });
      setToken(r.token);
      const m = await api.me(r.token);
      setMe(m);
      setNotice(null);
      setStatus("authed");
    }
    return r;
  }, []);

  const logout = useCallback(async (all = false) => {
    const t = token;
    reset(all ? "Você saiu de todos os aparelhos." : undefined);
    if (t) {
      try { await api.logout(t, all); } catch { /* a sessão local já foi apagada */ }
    }
  }, [token, reset]);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    setMe(await api.me(token));
  }, [token]);

  const value = useMemo<AuthState>(() => ({
    status, token, me, notice, login, logout, refreshMe,
    setProfile: (p) => setMe((m) => (m ? { ...m, profile: p } : m)),
    setSettings: (s) => setMe((m) => (m ? { ...m, settings: s } : m)),
    clearNotice: () => setNotice(null),
  }), [status, token, me, notice, login, logout, refreshMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}

/** Token garantido (usar só em telas protegidas). */
export function useToken(): string {
  const { token } = useAuth();
  if (!token) throw new Error("sem sessão");
  return token;
}
