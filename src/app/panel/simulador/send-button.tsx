"use client";

import { useFormStatus } from "react-dom";

export function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary min-w-28" disabled={pending}>
      {pending ? "Escribiendo…" : "Enviar"}
    </button>
  );
}
