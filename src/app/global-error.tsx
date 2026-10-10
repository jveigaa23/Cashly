"use client";

/**
 * Último recurso (o layout raiz falhou): sem CSS do app, então estilos inline,
 * com cores que funcionam no claro e no escuro. Recarregar resolve também uma
 * versão nova publicada enquanto a página estava aberta.
 */
export default function GlobalError() {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f5f7f6", color: "#14201c", fontSize: 18 }}>
        <main style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px" }}>
          <h1 style={{ fontSize: 26 }}>Algo deu errado</h1>
          <p style={{ lineHeight: 1.5 }}>
            Recarregue a página e tente de novo. Se você estava salvando algo, confira se a alteração aparece antes de
            repetir.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ minHeight: 48, padding: "0 20px", fontSize: 18, fontWeight: 600, border: 0, borderRadius: 12, background: "#0b6b5d", color: "#fff" }}
          >
            Recarregar a página
          </button>
        </main>
      </body>
    </html>
  );
}
