import type { Metadata, Viewport } from "next";
import { Zilla_Slab } from "next/font/google";
import "./globals.css";
import { identidade } from "@/config/identidade";
import { Cabecalho } from "@/components/Cabecalho";

// Letra "de placa" para o nome e os títulos (estilo rústico de bar).
const fonteTitulo = Zilla_Slab({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--fonte-titulo",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Escala · ${identidade.nome}`,
  description: "Sistema de escala de funcionários",
};

// Pinta a barra do navegador do celular com a cor principal.
export const viewport: Viewport = {
  themeColor: identidade.corPrincipal,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // As cores da identidade viram variáveis CSS para toda a aplicação.
  const estilo = {
    "--cor-principal": identidade.corPrincipal,
    "--cor-secundaria": identidade.corSecundaria,
    "--cor-destaque": identidade.corDestaque,
  } as React.CSSProperties;

  return (
    <html lang="pt-BR" className={`h-full antialiased ${fonteTitulo.variable}`} style={estilo}>
      <body className="flex min-h-full flex-col">
        <Cabecalho />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-neutral-500">
          {identidade.nome} · sistema de escala
        </footer>
      </body>
    </html>
  );
}
