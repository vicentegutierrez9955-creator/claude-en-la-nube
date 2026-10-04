import Link from "next/link";
import { ErrorNote, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { ProductForm } from "./form";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const products = await db.product.findMany({ where: { businessId: user.businessId }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="Productos" subtitle="El vendedor IA solo ofrece lo que está aquí, con estos precios y este stock." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-x-auto p-0 lg:col-span-3">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2">Precio</th>
                <th className="px-3 py-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-gray-500">
                    Agrega tu primer producto →
                  </td>
                </tr>
              )}
              {products.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <Link href={`/panel/productos/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <span className="ml-2 text-xs text-gray-500">(oculto)</span>}
                  </td>
                  <td className="px-3 py-2">{formatCLP(p.price)}</td>
                  <td className={`px-3 py-2 ${p.stock <= 0 ? "font-semibold text-red-600" : ""}`}>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-bold">Nuevo producto</h2>
          <ErrorNote message={error} />
          <ProductForm />
        </div>
      </div>
    </>
  );
}
