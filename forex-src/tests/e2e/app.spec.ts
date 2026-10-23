// Testes de tela (K, L e fluxo de importação) contra o build de produção com backend simulado.
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildMock } from "./mock";

const mock = buildMock();
const shots = process.env.SHOTS_DIR;

async function noHorizontalScroll(page: Page) {
  const r = await page.evaluate(() => {
    const iw = document.documentElement.clientWidth;
    // elementos que passam da borda direita e não estão dentro de uma área com rolagem própria
    const offenders: string[] = [];
    for (const el of Array.from(document.querySelectorAll("main *, header *"))) {
      const b = (el as HTMLElement).getBoundingClientRect();
      if (b.width === 0 || b.right <= iw + 1) continue;
      let p: HTMLElement | null = (el as HTMLElement).parentElement;
      let clipped = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)} → ${Math.round(b.right)}px`);
    }
    return { sw: document.documentElement.scrollWidth, iw, offenders: offenders.slice(0, 5) };
  });
  expect(r.offenders, "elementos passando da largura da tela").toEqual([]);
  expect(r.sw, "a página não pode rolar na horizontal").toBeLessThanOrEqual(r.iw + 1);
}

async function snap(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-${name}.png`, fullPage: true });
}

async function login(page: Page) {
  await page.goto("./#/login");
  await page.getByLabel("Telefone").fill("41991542931");
  for (const [i, d] of ["2", "5", "8", "0"].entries()) await page.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  await expect(page).toHaveURL(/#\/$/);
}

test.beforeEach(async ({ page }) => {
  await mock.install(page);
});

test("login: PIN errado mostra erro; certo abre o dashboard", async ({ page }) => {
  await page.goto("./#/login");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await snap(page, "01-login");
  await page.getByLabel("Telefone").fill("41991542931");
  for (const [i, d] of ["1", "1", "1", "2"].entries()) await page.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  await expect(page.getByText("Telefone ou PIN incorretos")).toBeVisible();
  await noHorizontalScroll(page);
  await login(page);
});

test("dashboard mostra os indicadores calculados", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Patrimônio estimado").first()).toBeVisible();
  await expect(page.getByText("Lucro total")).toBeVisible();
  // valores do arquivo real ficam fora do Git (tests/.local/expected.json)
  const expFile = new URL("../.local/expected.json", import.meta.url);
  if (process.env.DDS_CSV && existsSync(process.env.DDS_CSV) && existsSync(expFile)) {
    const ui = JSON.parse(readFileSync(expFile, "utf8")).ui as Record<string, string>;
    for (const v of Object.values(ui)) await expect(page.getByText(v).first()).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /Lucro diário/ })).toBeVisible();
  await noHorizontalScroll(page);
  await snap(page, "02-dashboard");
  await page.getByRole("button", { name: "Tudo" }).first().click();
  await page.getByRole("button", { name: "Em reais" }).click();
  await expect(page.getByText(/variação do dólar/)).toBeVisible();
  await noHorizontalScroll(page);
});

test("K: sessão continua após recarregar a página", async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(page.getByText("Lucro total")).toBeVisible();
});

test("telas principais abrem sem rolagem horizontal", async ({ page }) => {
  await login(page);
  const screens: Array<[string, RegExp | string]> = [
    ["#/movimentacoes", "Movimentações"],
    ["#/importar", "Importar arquivo"],
    ["#/importacoes", "Histórico de importações"],
    ["#/capital", "Capital e rentabilidade"],
    ["#/cambio", "Cotação cambial"],
    ["#/configuracoes", "Configurações"],
    ["#/admin", "Administração de acessos"],
  ];
  for (const [hash, title] of screens) {
    await page.goto("./" + hash);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await page.waitForTimeout(150);
    await noHorizontalScroll(page);
    await snap(page, "03-" + hash.replace(/[#/]/g, ""));
  }
});

test("detalhe de movimentação mostra os dados originais", async ({ page }) => {
  await login(page);
  await page.goto("./#/movimentacoes");
  await page.locator("main a[href*='movimentacoes/']:visible").first().click();
  await expect(page.getByText("Dados originais da planilha")).toBeVisible();
  await expect(page.getByText("Como entra nos cálculos")).toBeVisible();
  await noHorizontalScroll(page);
  await snap(page, "04-detalhe");
});

test("importação: prévia do arquivo real", async ({ page }) => {
  test.skip(!process.env.DDS_CSV || !existsSync(process.env.DDS_CSV), "precisa do CSV real");
  await login(page);
  await page.goto("./#/importar");
  await page.locator("input[type=file]").setInputFiles(process.env.DDS_CSV!);
  await expect(page.getByRole("heading", { name: "Conferir importação" })).toBeVisible();
  await expect(page.getByText("Este mesmo arquivo já foi importado")).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirmar \(nenhum registro novo\)/ })).toBeVisible();
  await noHorizontalScroll(page);
  await snap(page, "05-previa");
});
