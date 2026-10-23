import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Recover from "./pages/Recover";
import ChangePin from "./pages/ChangePin";
import { AuthProvider, useAuth } from "./state/auth";
import { DataProvider } from "./state/data";

// telas carregadas sob demanda (os gráficos ficam num pacote separado)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Movements = lazy(() => import("./pages/Movements"));
const MovementDetail = lazy(() => import("./pages/Movements").then((m) => ({ default: m.MovementDetail })));
const Import = lazy(() => import("./pages/Import"));
const ImportHistory = lazy(() => import("./pages/ImportHistory"));
const ImportDetail = lazy(() => import("./pages/ImportHistory").then((m) => ({ default: m.ImportDetail })));
const Capital = lazy(() => import("./pages/Capital"));
const Fx = lazy(() => import("./pages/Fx"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink">
      <Spinner label="Carregando DDS Finance" />
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { status, me } = useAuth();
  const loc = useLocation();
  if (status === "loading") return <FullScreenLoading />;
  if (status === "anon") return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (me?.profile.must_change_pin && loc.pathname !== "/trocar-pin") return <Navigate to="/trocar-pin" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <FullScreenLoading />;
  if (status === "authed") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/recuperar" element={<Recover />} />
      <Route path="/trocar-pin" element={<Protected><ChangePin /></Protected>} />
      <Route
        path="/*"
        element={
          <Protected>
            <DataProvider>
              <Layout>
                <Suspense fallback={<div className="py-10"><Spinner /></div>}>
                  <Routes>
                    <Route index element={<Dashboard />} />
                    <Route path="movimentacoes" element={<Movements />} />
                    <Route path="movimentacoes/:id" element={<MovementDetail />} />
                    <Route path="importar" element={<Import />} />
                    <Route path="importacoes" element={<ImportHistory />} />
                    <Route path="importacoes/:id" element={<ImportDetail />} />
                    <Route path="capital" element={<Capital />} />
                    <Route path="cambio" element={<Fx />} />
                    <Route path="configuracoes" element={<SettingsPage />} />
                    <Route path="admin" element={<Admin />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            </DataProvider>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
