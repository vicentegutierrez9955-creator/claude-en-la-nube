import Link from "next/link";
import { ErrorNote, Field } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { login } from "../auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Link href="/" className="mb-8 text-center text-lg font-bold">
        {BRAND}
      </Link>
      <form action={login} className="card space-y-4">
        <h1 className="text-xl font-bold">Entrar</h1>
        <ErrorNote message={error} />
        <Field label="Correo" name="email" type="email" required />
        <Field label="Clave" name="password" type="password" required />
        <button className="btn-primary w-full">Entrar</button>
        <p className="text-center text-sm text-gray-600">
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="font-semibold text-brand-700">
            Regístrate
          </Link>
        </p>
      </form>
    </main>
  );
}
