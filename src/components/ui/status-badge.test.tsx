import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("comunica o status por texto e ícone, não só por cor", () => {
    const { container } = render(<StatusBadge tone="danger">Vencida</StatusBadge>);
    expect(screen.getByText("Vencida")).toBeVisible();
    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
  });
});
