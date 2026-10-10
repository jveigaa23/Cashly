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
  { href: "/relatorios", label: "Relatórios", Icon: ChartIcon },
  { href: "/ajustes", label: "Ajustes", Icon: SettingsIcon },
] as const;

/** No celular, "Ajustes" fica no cabeçalho para as abas terem espaço. */
export const BOTTOM_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/ajustes");

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
