"use client";

import { useEffect } from "react";

/** Rola a tela até o elemento indicado (ex.: o lançamento que acabou de ser salvo). */
export function ScrollIntoView({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [targetId]);
  return null;
}
