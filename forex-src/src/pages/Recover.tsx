import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";
import { Logo } from "../components/Layout";
import { Notice } from "../components/ui";
import { ADMIN_WHATSAPP } from "../config";

export default function Recover() {
  const [params] = useSearchParams();
  const isNew = params.get("novo") === "1";
  useEffect(() => {
    document.title = (isNew ? "Pedir acesso" : "Recuperar acesso") + " · DDS Finance";
  }, [isNew]);
  const text = isNew
    ? "Olá! Gostaria de pedir um acesso ao DDS Finance. Meu nome e telefone são: "
    : "Olá! Esqueci meu PIN do DDS Finance e preciso redefinir. Meu telefone cadastrado é: ";
  const wa = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex min-h-screen flex-col items-center bg-ink px-5 pb-8 pt-10 text-white">
      <main className="flex w-full max-w-[420px] flex-col gap-6">
        <Link to="/login" className="-ml-2 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-sky">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar para o login
        </Link>
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <h1 className="text-2xl font-extrabold tracking-tight">{isNew ? "Pedir acesso" : "Recuperar acesso"}</h1>
        </div>

        <section className="flex flex-col gap-4 rounded-[22px] border border-ink-700 bg-ink-800 p-6 text-sm leading-relaxed text-mute-strong">
          {isNew ? (
            <>
              <p>O DDS Finance não tem cadastro aberto. Cada acesso é criado pelo administrador, que confirma quem você é antes de liberar.</p>
              <p>Você recebe um PIN provisório e cria o seu PIN definitivo no primeiro acesso.</p>
            </>
          ) : (
            <>
              <p>Por segurança, o PIN nunca é enviado nem recuperado: ele fica guardado de forma irreversível.</p>
              <p>O administrador confirma a sua identidade e gera um <strong className="text-white">PIN provisório</strong>. No próximo acesso você cria um novo PIN, e todas as sessões abertas em outros aparelhos são encerradas.</p>
            </>
          )}
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-pos px-4 text-base font-extrabold text-ink hover:brightness-105">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />Falar com o administrador
          </a>
        </section>

        <Notice tone="info" title="Já está logado?">
          Para trocar o PIN, use Configurações › Trocar PIN. Não é preciso falar com o administrador.
        </Notice>
        <div className="flex items-center justify-center gap-2 text-xs text-mute">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />O administrador não vê seus dados financeiros.
        </div>
      </main>
    </div>
  );
}
