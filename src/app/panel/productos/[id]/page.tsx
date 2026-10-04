import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductForm } from "../form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const product = await db.product.findFirst({ where: { id, businessId: user.businessId } });
  if (!product) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader title="Editar producto" />
      <ProductForm product={product} />
    </div>
  );
}
