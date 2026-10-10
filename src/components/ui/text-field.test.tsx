import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TextField } from "./text-field";

describe("TextField", () => {
  it("associa rótulo, dica e erro ao campo", () => {
    render(<TextField label="E-mail" name="email" hint="O mesmo do convite" errors={["E-mail inválido."]} />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("O mesmo do convite E-mail inválido.");
  });

  it("permite mostrar e ocultar a senha", async () => {
    render(<TextField label="Senha" name="password" type="password" />);
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(input).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
