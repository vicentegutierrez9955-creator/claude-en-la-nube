import { describe, expect, it } from "vitest";
import { redactPersonalData } from "@/lib/privacy";

describe("filtro de datos personales", () => {
  it("oculta teléfonos, RUT, correos y direcciones", () => {
    expect(redactPersonalData("mi fono es +56 9 1234 5678")).toBe("mi fono es [teléfono oculto]");
    expect(redactPersonalData("llámame al 912345678")).toBe("llámame al [teléfono oculto]");
    expect(redactPersonalData("RUT 12.345.678-9 por favor")).toBe("RUT [RUT oculto] por favor");
    expect(redactPersonalData("escríbeme a ana.perez@gmail.com")).toBe("escríbeme a [correo oculto]");
    expect(redactPersonalData("mándalo a calle Los Aromos 45")).toBe("mándalo a [dirección oculta]");
    expect(redactPersonalData("Av. Libertad 870 depto 302, Viña")).toBe("[dirección oculta], Viña");
  });

  it("no toca precios, cantidades ni tallas", () => {
    const text = "quiero 2 poleras talla M de $12.990, y 1 jockey";
    expect(redactPersonalData(text)).toBe(text);
  });
});
