"use client";

import { Badge, Table } from "@/components/ui";
import Link from "next/link";
import { useState, type ReactNode } from "react";

type Category = { id: string; name: string };
type ProductRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  brandName: string | null;
  price: string;
  stock: string;
  active: boolean;
};

const chip = "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition";

export function CatalogList({
  categories,
  products,
  children,
  writable = false,
}: {
  categories: Category[];
  products: ProductRow[];
  children?: ReactNode;
  writable?: boolean;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const selected = categories.some((category) => category.id === categoryId) ? categoryId : null;
  const visible = selected ? products.filter((product) => product.categoryId === selected) : products;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={chip}
          style={selected === null
            ? { background: "var(--pf-button)", color: "var(--pf-button-ink)" }
            : { background: "color-mix(in srgb, var(--pf-button) 12%, white)", color: "var(--pf-button)" }}
          onClick={() => setCategoryId(null)}
        >
          Todos
        </button>
        {categories.map((category) => {
          const active = category.id === selected;
          return (
            <button
              key={category.id}
              type="button"
              className={chip}
              style={active
                ? { background: "var(--pf-button)", color: "var(--pf-button-ink)" }
                : { background: "color-mix(in srgb, var(--pf-button) 12%, white)", color: "var(--pf-button)" }}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          );
        })}
      </div>
      {children}
      <Table
        columns={writable ? ["Código", "Producto", "Categoría", "Marca", "Precio", "Stock", "Estado", ""] : ["Código", "Producto", "Categoría", "Marca", "Precio", "Stock", "Estado"]}
        rows={visible.map((product) => ({
          key: product.id,
          cells: [
            product.code,
            product.name,
            product.categoryName ?? "—",
            product.brandName ?? "—",
            product.price,
            product.stock,
            product.active ? <Badge key="s" tone="ok">Activo</Badge> : <Badge key="s" tone="neutral">Inactivo</Badge>,
            ...(writable ? [<Link key="e" href={`/productos/${product.id}`}>Editar</Link>] : []),
          ],
        }))}
      />
    </div>
  );
}
