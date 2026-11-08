"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { identidade } from "@/config/identidade";
import { menu } from "@/config/menu";

// Cabeçalho com parede de tijolos (classe .cabecalho-tijolos em globals.css),
// logo e nome centralizados. Sobe junto com a página ao rolar.
export function Cabecalho() {
  const caminho = usePathname();
  return (
    <header className="cabecalho-tijolos text-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-1.5 px-4 pt-3.5 pb-2.5">
        {identidade.logo ? (
          <Image
            src={identidade.logo}
            alt={`Logo ${identidade.nome}`}
            width={64}
            height={64}
            priority
            className="h-16 w-16 rounded-full object-cover shadow-[0_0_0_3px_var(--cor-destaque),0_4px_14px_rgba(0,0,0,0.5)]"
          />
        ) : null}
        <span className="titulo-marca text-center text-[1.65rem] leading-tight font-bold">
          {identidade.nome}
        </span>
      </div>
      <nav className="mx-auto flex max-w-3xl justify-[safe_center] gap-1 overflow-x-auto px-2 pb-2.5">
        {menu.map((item) => {
          const ativo = caminho === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${
                ativo
                  ? "bg-[var(--cor-destaque)] text-[#3F0F18]"
                  : "bg-[rgba(63,15,24,0.88)] hover:bg-[rgba(63,15,24,1)]"
              }`}
            >
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
