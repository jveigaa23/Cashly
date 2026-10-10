import { describe, expect, it } from "vitest";
import { assetLinks } from "./android";

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");

describe("assetLinks", () => {
  it("monta o JSON do Digital Asset Links, normalizando para maiúsculas", () => {
    expect(assetLinks("app.cashly.twa", `${FP}, ${FP.toUpperCase()}`)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "app.cashly.twa", sha256_cert_fingerprints: [FP.toUpperCase(), FP.toUpperCase()] },
      },
    ]);
  });
  it("sem configuração ou com valor inválido não publica nada", () => {
    expect(assetLinks(undefined, FP)).toBeNull();
    expect(assetLinks("app.cashly.twa", "")).toBeNull();
    expect(assetLinks("app.cashly.twa", "AB:CD")).toBeNull();
    expect(assetLinks("pacote inválido", FP)).toBeNull();
  });
});
