export const THEME_STORAGE_KEY = "cashly-theme";
export const THEME_CHANGE_EVENT = "cashly-theme-change";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/**
 * Script executado de forma síncrona no <head>, antes da primeira pintura,
 * para aplicar o tema salvo sem "piscar". Precisa ser autocontido (ES5).
 * Também acompanha mudanças do sistema operacional quando a preferência é "system".
 */
export const themeInitScript = `(function(){
var k=${JSON.stringify(THEME_STORAGE_KEY)},d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");
function pref(){try{var v=localStorage.getItem(k);if(v==="light"||v==="dark"||v==="system")return v}catch(e){}return "system"}
function apply(){var p=pref(),r=p==="system"?(m.matches?"dark":"light"):p;d.setAttribute("data-theme",r);d.setAttribute("data-theme-preference",p)}
apply();
if(m.addEventListener)m.addEventListener("change",apply);
window.addEventListener(${JSON.stringify(THEME_CHANGE_EVENT)},apply);
window.addEventListener("storage",function(e){if(e.key===k)apply()});
})();`;
