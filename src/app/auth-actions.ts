"use server";

import { redirect } from "next/navigation";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function register(form: FormData) {
  const businessName = str(form, "businessName");
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  if (!businessName || !name || !email || password.length < 8) {
    redirect("/registro?error=" + encodeURIComponent("Completa todos los campos. La clave debe tener al menos 8 caracteres."));
  }
  if (await db.user.findUnique({ where: { email } })) {
    redirect("/registro?error=" + encodeURIComponent("Ya existe una cuenta con ese correo."));
  }
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      business: { create: { name: businessName, originName: businessName } },
    },
  });
  await startSession(user.id);
  redirect("/panel");
}

export async function login(form: FormData) {
  const email = str(form, "email").toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(str(form, "password"), user.passwordHash))) {
    redirect("/login?error=" + encodeURIComponent("Correo o clave incorrectos."));
  }
  await startSession(user.id);
  redirect("/panel");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
