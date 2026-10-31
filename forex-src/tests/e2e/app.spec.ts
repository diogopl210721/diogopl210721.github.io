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

test("cadastro: telefone e PIN confirmados criam a conta e já entram", async ({ page }) => {
  await page.goto("./#/login");
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  await page.getByLabel("Seu nome").fill("Maria Teste");
  await page.getByLabel("Telefone", { exact: true }).fill("41988880001");
  await page.getByLabel("Confirme o telefone").fill("41988880002");
  await expect(page.getByText("Os telefones não são iguais.")).toBeVisible();
  await page.getByLabel("Confirme o telefone").fill("41988880001");
  await expect(page.getByText("Os telefones não são iguais.")).toHaveCount(0);
  const pin = page.getByRole("group", { name: "Crie um PIN de 4 dígitos" });
  const pin2 = page.getByRole("group", { name: "Confirme o PIN" });
  for (const [i, d] of ["7", "3", "9", "1"].entries()) await pin.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  for (const [i, d] of ["7", "3", "9", "2"].entries()) await pin2.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  await expect(page.getByText("Os PINs não são iguais.")).toBeVisible();
  await noHorizontalScroll(page);
  await snap(page, "06-cadastro");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Os dois PINs não são iguais. Digite de novo.")).toBeVisible();
  await pin2.getByLabel("Dígito 4 do PIN").fill("1");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText("Nenhuma movimentação ainda")).toBeVisible();
});

test("cadastro: telefone que já tem conta e PIN fácil são recusados", async ({ page }) => {
  await page.goto("./#/cadastro");
  await page.getByLabel("Seu nome").fill("Outro");
  await page.getByLabel("Telefone", { exact: true }).fill("41991542931");
  await page.getByLabel("Confirme o telefone").fill("41991542931");
  const pin = page.getByRole("group", { name: "Crie um PIN de 4 dígitos" });
  const pin2 = page.getByRole("group", { name: "Confirme o PIN" });
  for (const [i, d] of ["1", "2", "3", "4"].entries()) await pin.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  for (const [i, d] of ["1", "2", "3", "4"].entries()) await pin2.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Evite sequências (ex.: 1234).")).toBeVisible();
  for (const [i, d] of ["5", "8", "2", "0"].entries()) await pin.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  for (const [i, d] of ["5", "8", "2", "0"].entries()) await pin2.getByLabel(`Dígito ${i + 1} do PIN`).fill(d);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByText("Já existe uma conta com esse telefone.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Entre com seu PIN" })).toBeVisible();
});

test("link antigo de pedir acesso leva ao cadastro", async ({ page }) => {
  await page.goto("./#/recuperar?novo=1");
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
});

test("comissão PAMM aparece separada do lucro", async ({ page }) => {
  await login(page);
  await expect(page.getByText("Comissões PAMM").first()).toBeVisible();
  await page.goto("./#/movimentacoes");
  await page.getByRole("button", { name: "Comissões" }).click();
  if (process.env.DDS_CSV) {
    await expect(page.locator("main >> text=/^Comissão PAMM$/ >> visible=true").first()).toBeVisible();
    await expect(page.locator("main >> text=/^Trade$/ >> visible=true")).toHaveCount(0);
  }
  await noHorizontalScroll(page);
  await snap(page, "07-comissoes");
});
