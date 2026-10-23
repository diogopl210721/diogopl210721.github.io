// Configuração pública do DDS Finance.
// A chave abaixo é a chave PUBLICÁVEL do Supabase (feita para ficar no navegador).
// Ela não dá acesso a nenhuma tabela: tudo passa por funções que exigem o token de sessão.
// Nunca coloque aqui a chave de serviço (service_role / secret).
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || "https://arffptuclrrzuzdrcmuc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_XCY3BoeUR_jzDSRrtlibyg_Os7lIrVi";
export const PTAX_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/forex-ptax`;

// Contato do administrador para recuperação de acesso (WhatsApp, só dígitos com DDI).
export const ADMIN_WHATSAPP: string = import.meta.env.VITE_ADMIN_WHATSAPP || "5541991542931";

export const APP_VERSION = "1.0.0";
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ROWS = 50000;
export const REQUIRED_COLUMNS = ["Id", "Reason", "Currency", "Amount", "AmountProfit", "Time"] as const;
export const EXPECTED_COLUMNS = [
  "Id", "Reason", "InvestmentId", "InvestorName", "ManagerId", "ManagerName", "ManagerConfiguration",
  "Currency", "Amount", "AmountProfit", "RolloverId", "RequestId", "PlatformPositionId",
  "PlatformOperationId", "Time", "Comment", "CounterpartyLogin", "CounterpartyServerId", "CounterpartyServerName",
] as const;
