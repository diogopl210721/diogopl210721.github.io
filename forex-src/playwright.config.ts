import { defineConfig, devices } from "@playwright/test";

// Testa o build de produção (vite preview) com o backend simulado em tests/e2e/mock.ts.
const executablePath = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/forex/",
    launchOptions: { executablePath },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/forex/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, launchOptions: { executablePath } } },
    { name: "computador", use: { viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
  ],
});
