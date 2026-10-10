"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Algo deu errado</h1>
        <p>Tente novamente. Se você estava salvando algo, confira se a alteração aparece antes de repetir.</p>
        <button type="button" onClick={reset} style={{ minHeight: 48, padding: "0 20px" }}>
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
