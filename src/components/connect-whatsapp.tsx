"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Botón "Conectar WhatsApp": abre la ventana oficial de Meta (Embedded Signup).
// La pyme inicia sesión con Facebook, elige su número y listo.

type FacebookSdk = {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(
    callback: (response: { authResponse?: { code?: string } | null; status?: string }) => void,
    opts: Record<string, unknown>,
  ): void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

type SessionInfo = { wabaId?: string; phoneNumberId?: string; coexistence: boolean };

export function ConnectWhatsApp({ appId, configId, graphVersion }: { appId: string; configId: string; graphVersion: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<SessionInfo | null>(null);

  useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      setReady(true);
    };
    if (window.FB) {
      window.fbAsyncInit();
    } else if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }

    // Meta avisa por mensaje de ventana qué cuenta y número eligió la pyme.
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (String(data.event).startsWith("FINISH")) {
          session.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
            coexistence: data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
          };
        } else if (data.event === "CANCEL") {
          setStatus({ kind: "info", text: "Se cerró la ventana antes de terminar. Puedes intentarlo de nuevo cuando quieras." });
          setBusy(false);
        } else if (data.event === "ERROR") {
          setStatus({ kind: "error", text: `Meta informó un error: ${data.data?.error_message ?? "intenta de nuevo"}` });
          setBusy(false);
        }
      } catch {
        // mensajes de otras partes de Facebook: se ignoran
      }
    };
    window.addEventListener("message", onMessage);
    // Si el script de Meta no carga (sin internet o un bloqueador de anuncios), se avisa.
    const timeout = setTimeout(() => {
      if (!window.FB) {
        setStatus({
          kind: "error",
          text: "No se pudo cargar la ventana de Meta. Revisa tu conexión o desactiva el bloqueador de anuncios y recarga la página.",
        });
      }
    }, 10000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
  }, [appId, graphVersion]);

  async function finish(code: string, coexistence: boolean) {
    // El aviso con la cuenta elegida puede llegar un poco después del código.
    for (let i = 0; i < 20 && !session.current?.wabaId; i++) await new Promise((r) => setTimeout(r, 250));
    const info = session.current;
    if (!info?.wabaId) {
      setStatus({ kind: "error", text: "Meta no informó qué cuenta elegiste. Intenta de nuevo." });
      setBusy(false);
      return;
    }
    setStatus({ kind: "info", text: "Conectando tu número…" });
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, wabaId: info.wabaId, phoneNumberId: info.phoneNumberId ?? null, coexistence: info.coexistence || coexistence }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; displayPhone?: string };
    setBusy(false);
    if (!res.ok) {
      setStatus({ kind: "error", text: data.error ?? "No se pudo conectar." });
      return;
    }
    setStatus({ kind: "ok", text: `¡Listo! ${data.displayPhone ?? "Tu número"} ya está conectado.` });
    router.refresh();
  }

  function launch(coexistence: boolean) {
    if (!window.FB) return;
    session.current = null;
    setBusy(true);
    setStatus({ kind: "info", text: "Sigue los pasos en la ventana de Meta…" });
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) {
          void finish(code, coexistence);
        } else {
          setBusy(false);
          setStatus({ kind: "info", text: "No se completó la conexión. Puedes intentarlo de nuevo." });
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
          ...(coexistence ? { featureType: "whatsapp_business_app_onboarding" } : {}),
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => launch(true)} disabled={!ready || busy} className="btn-primary w-full py-3 text-base sm:w-auto">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2Z" />
        </svg>
        {busy ? "Conectando…" : "Conectar mi WhatsApp Business"}
      </button>
      <p className="text-xs text-gray-600">
        Usa el mismo número que ya tienes en la app WhatsApp Business: sigues viendo y respondiendo los chats en tu celular, y el
        vendedor IA atiende por ti. Necesitas la app actualizada y usarla hace al menos 7 días.
      </p>
      <button type="button" onClick={() => launch(false)} disabled={!ready || busy} className="text-xs font-medium text-brand-700 underline disabled:opacity-50">
        Prefiero conectar un número nuevo (que no esté en ninguna app de WhatsApp)
      </button>
      {status && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            status.kind === "error" ? "bg-red-50 text-red-700" : status.kind === "ok" ? "bg-brand-50 text-brand-700" : "bg-gray-50 text-gray-700"
          }`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
