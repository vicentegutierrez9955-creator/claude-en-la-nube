import type { Product } from "@prisma/client";
import { Field } from "@/components/ui";
import { saveProduct } from "../actions";

export function ProductForm({ product }: { product?: Product }) {
  return (
    <form action={saveProduct} className="card space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="name" defaultValue={product?.name} required placeholder="Polera algodón negra" />
        <Field label="SKU / código (opcional)" name="sku" defaultValue={product?.sku} />
        <Field label="Precio (CLP)" name="price" type="number" defaultValue={product?.price} required />
        <Field label="Stock" name="stock" type="number" defaultValue={product?.stock ?? 0} />
        <Field label="Peso por unidad (gramos)" name="weightGrams" type="number" defaultValue={product?.weightGrams ?? 500} hint="Se usa para el envío" />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Descripción para el vendedor IA
        </label>
        <textarea
          id="description"
          name="description"
          className="input min-h-24"
          defaultValue={product?.description}
          placeholder="Tallas, colores, materiales, medidas... todo lo que un cliente podría preguntar."
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Disponible para la venta
      </label>
      <button className="btn-primary">{product ? "Guardar cambios" : "Agregar producto"}</button>
    </form>
  );
}
