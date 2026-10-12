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
        <h1 className="text-xl font-bold">Crea la cuenta de tu tienda</h1>
        <ErrorNote message={error} />
        <Field label="Nombre de la tienda" name="businessName" required placeholder="Ej: Poleras Valpo" />
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
