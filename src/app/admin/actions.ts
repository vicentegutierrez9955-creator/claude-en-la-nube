"use server";

import { revalidatePath } from "next/cache";
import { AI_MODELS } from "@/lib/ai-usage";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function setBusinessAiAction(form: FormData) {
  await requireAdmin();
  const businessId = String(form.get("businessId") ?? "");
  const model = String(form.get("aiModel") ?? "");
  const limit = Number(String(form.get("aiMonthlyLimitUsd") ?? "0").replace(",", "."));
  await db.business.update({
    where: { id: businessId },
    data: {
      aiModel: AI_MODELS.some((m) => m.id === model) ? model : null,
      aiMonthlyLimitUsd: Number.isFinite(limit) && limit > 0 ? Math.round(limit * 100) / 100 : 0,
    },
  });
  revalidatePath("/admin");
}
