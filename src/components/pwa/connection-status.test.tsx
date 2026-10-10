import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "./connection-status";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

describe("ConnectionStatus", () => {
  it("avisa quando a conexão cai e some quando volta", () => {
    render(<ConnectionStatus />);
    expect(screen.queryByText(/Sem internet/)).toBeNull();

    setOnline(false);
    expect(
      screen.getByText("Sem internet. Nada será salvo até a conexão voltar."),
    ).toBeVisible();

    setOnline(true);
    expect(screen.queryByText(/Sem internet/)).toBeNull();
  });
});
