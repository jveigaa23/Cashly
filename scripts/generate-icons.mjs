// Gera os ícones PWA a partir de um único desenho vetorial.
// Uso: pnpm icons  (requer o Chromium do Playwright)
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BRAND = "#0b6b5d";

// Casa com três barras ascendentes: "finanças da família". Sem texto.
const glyph = `
  <path d="M256 96 88 236h44v172h248V236h44z" fill="#ffffff"/>
  <rect x="176" y="300" width="40" height="72" rx="8" fill="${BRAND}"/>
  <rect x="236" y="262" width="40" height="110" rx="8" fill="${BRAND}"/>
  <rect x="296" y="220" width="40" height="152" rx="8" fill="${BRAND}"/>`;

function svg({ maskable }) {
  // Ícones "maskable" ocupam o quadrado inteiro e mantêm o desenho na
  // zona segura central (80%); os comuns têm cantos arredondados.
  const background = maskable
    ? `<rect width="512" height="512" fill="${BRAND}"/>`
    : `<rect width="512" height="512" rx="112" fill="${BRAND}"/>`;
  const content = maskable
    ? `<g transform="translate(256 262) scale(0.72) translate(-256 -252)">${glyph}</g>`
    : `<g transform="translate(0 4)">${glyph}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${background}${content}</svg>`;
}

const targets = [
  { file: "public/icons/icon-192.png", size: 192, maskable: false },
  { file: "public/icons/icon-512.png", size: 512, maskable: false },
  { file: "public/icons/maskable-512.png", size: 512, maskable: true },
  // Apple aplica a própria máscara: usar fundo cheio.
  { file: "src/app/apple-icon.png", size: 180, maskable: true },
];

await writeFile("src/app/icon.svg", svg({ maskable: false }) + "\n");

const browser = await chromium.launch();
try {
  for (const { file, size, maskable } of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg({ maskable }).replace(
        "<svg ",
        `<svg width="${size}" height="${size}" `,
      )}</body></html>`,
    );
    await page.screenshot({ path: file, omitBackground: true });
    await page.close();
    console.log(`gerado ${file}`);
  }
} finally {
  await browser.close();
}
