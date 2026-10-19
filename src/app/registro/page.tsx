import Link from "next/link";
import { ErrorNote, Field } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { register } from "../auth-actions";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Link href="/" className="mb-8 text-center text-lg font-bold">
        {BRAND}
      </Link>
      <form action={register} className="card space-y-4">
        <h1 className="text-xl font-bold">Crea la cuenta de tu negocio</h1>
        <ErrorNote message={error} />
        <fieldset>
          <legend className="label">¿Qué haces?</legend>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3">
              <input type="radio" name="kind" value="TIENDA" defaultChecked /> Vendo productos
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-gray-200 p-3">
              <input type="radio" name="kind" value="AGENDA" /> Atiendo con hora
            </label>
          </div>
        </fieldset>
        <Field label="Nombre del negocio" name="businessName" required placeholder="Ej: Poleras Valpo o Podología Ana" />
        <Field label="Tu nombre" name="name" required />
        <Field label="Correo" name="email" type="email" required />
        <Field label="Clave" name="password" type="password" required hint="Mínimo 8 caracteres" />
        <button className="btn-primary w-full">Crear cuenta</button>
        <p className="text-center text-sm text-gray-600">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-brand-700">
            Entra
          </Link>
        </p>
      </form>
    </main>
  );
}
