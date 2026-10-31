import { useEffect } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, ShieldCheck } from "lucide-react";
import { Copyright, Logo } from "../components/Layout";
import { Notice } from "../components/ui";
import { ADMIN_WHATSAPP } from "../config";

/** Esqueci meu PIN. (O antigo "pedir acesso" virou o cadastro aberto em /cadastro.) */
export default function Recover() {
  const [params] = useSearchParams();
  useEffect(() => {
    document.title = "Recuperar acesso · DDS Finance";
  }, []);
  if (params.get("novo") === "1") return <Navigate to="/cadastro" replace />;
  const text = "Olá! Esqueci meu PIN do DDS Finance e preciso redefinir. Meu telefone cadastrado é: ";
  const wa = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex min-h-screen flex-col items-center bg-ink px-5 pb-8 pt-10 text-white">
      <main className="flex w-full max-w-[420px] flex-col gap-6">
        <Link to="/login" className="-ml-2 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl px-2 text-sm font-semibold text-sky">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar para o login
        </Link>
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <h1 className="text-2xl font-extrabold tracking-tight">Recuperar acesso</h1>
        </div>

        <section className="flex flex-col gap-4 rounded-[22px] border border-ink-700 bg-ink-800 p-6 text-sm leading-relaxed text-mute-strong">
          <p>Por segurança, o PIN nunca é enviado nem recuperado: ele fica guardado de forma irreversível.</p>
          <p>O administrador confirma que o telefone é seu e gera um <strong className="text-white">PIN provisório</strong>. No próximo acesso você cria um novo PIN, e todas as sessões abertas em outros aparelhos são encerradas.</p>
          <a href={wa} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-pos px-4 text-base font-extrabold text-ink hover:brightness-105">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />Falar com o administrador
          </a>
        </section>

        <Notice tone="info" title="Lembra o PIN e só quer trocar?">
          Entre normalmente e use Configurações › Trocar PIN. Ainda não tem conta? <Link to="/cadastro" className="font-bold text-white underline">Criar conta</Link>.
        </Notice>
        <div className="flex items-center justify-center gap-2 text-xs text-mute">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />O administrador não vê seus dados financeiros.
        </div>
        <Copyright />
      </main>
    </div>
  );
}
