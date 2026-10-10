import {
  BillIcon,
  ChartIcon,
  HomeIcon,
  ListIcon,
  SettingsIcon,
} from "@/components/ui/icons";

export const NAV_ITEMS = [
  { href: "/", label: "Início", Icon: HomeIcon },
  { href: "/contas", label: "Contas", Icon: BillIcon },
  { href: "/lancamentos", label: "Lançamentos", Icon: ListIcon },
  { href: "/parcelas", label: "Parcelamentos", Icon: BillIcon },
  { href: "/orcamento", label: "Orçamento", Icon: ChartIcon },
  { href: "/relatorios", label: "Relatórios", Icon: ChartIcon },
  { href: "/ajustes", label: "Ajustes", Icon: SettingsIcon },
] as const;

/** No celular, "Ajustes" fica no cabeçalho para as abas terem espaço. */
// Parcelamentos fica acessível pela tela de Contas no celular.
// Orçamento fica acessível pelo Início e por Relatórios no celular.
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => !["/ajustes", "/parcelas", "/orcamento"].includes(item.href));

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
