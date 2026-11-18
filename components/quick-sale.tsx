"use client";

import { checkoutDocumentAction } from "@/actions/assistant";
import { confirmSaleAction, getDraftAction, saveDraftAction } from "@/actions/sales";
import { emitDocument } from "@/components/assistant-emit";
import { printDocumentTicket, printSaleTicket } from "@/components/assistant-print";
import { ChargeWindow, type ChargeLine } from "@/components/charge-window";
import { CheckoutDocument, checkoutProblem, type CheckoutBuyer, type CheckoutKind } from "@/components/checkout-document";
import { ProductPhoto } from "@/components/product-photo";
import { CodeField, ScannerButton } from "@/components/scanner";
import { Button, ErrorText } from "@/components/ui";
import { formatMoney, formatQty, fromMoneyInt, mulScale, toFactorInt, toMoneyInt, toQtyInt } from "@/lib/money";
import { resolveUnitPriceText } from "@/lib/pricing";
import type { CatalogProduct, PriceListShape, PriceMode } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type DraftLine = { productId: string; presentationId: string; quantity: string };
type LoadedDraft = {
  id: string;
  idempotencyKey: string;
  lines: DraftLine[];
  customerId?: string | null;
  discountPercent: string;
  mode: PriceMode;
  priceListId?: string | null;
  saleType: "CASH" | "CREDIT";
};

export function QuickSale({
  products,
  categories,
  customers,
  lists,
  currency,
  discountLimit,
  allowCredit,
  canCredit,
  sessionOpen,
  draft,
}: {
  products: CatalogProduct[];
  categories: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  lists: PriceListShape[];
  currency: string;
  discountLimit: number;
  allowCredit: boolean;
  canCredit: boolean;
  sessionOpen: boolean;
  draft?: LoadedDraft;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlDraft = params.get("draft") ?? "";
  const wantCharge = params.get("cobro") === "1";
  const sellable = products.filter((product) => product.isActive);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<PriceMode>(draft?.mode ?? "SALE");
  const [listId, setListId] = useState(draft?.priceListId ?? "");
  const [lines, setLines] = useState<DraftLine[]>(draft?.lines ?? []);
  const [discountPct, setDiscountPct] = useState(draft?.discountPercent ?? "0");
  const [customerId, setCustomerId] = useState(draft?.customerId ?? "");
  const [saleType, setSaleType] = useState<"CASH" | "CREDIT">(draft?.saleType ?? "CASH");
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [payments, setPayments] = useState<ChargeLine[]>([{ method: "CASH", amount: "", reference: "" }]);
  const [paying, setPaying] = useState(false);
  const [docKind, setDocKind] = useState<CheckoutKind>("NOTA");
  const [buyer, setBuyer] = useState<CheckoutBuyer>({ document: "", name: "", address: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [variantsOf, setVariantsOf] = useState<string | null>(null);
  const keyRef = useRef(draft?.idempotencyKey ?? "");
  const appliedId = useRef(draft?.id ?? "");
  const chargeFor = useRef("");
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    // The sale screen stays mounted between visits, so useState keeps the empty cart from the last park.
    if (!urlDraft) return;
    if (urlDraft === appliedId.current && linesRef.current.length > 0) return;
    let cancelled = false;
    setLoadingDraft(true);
    getDraftAction(urlDraft).then((result) => {
      if (cancelled) return;
      setLoadingDraft(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      appliedId.current = result.draft.id;
      keyRef.current = result.draft.idempotencyKey;
      setLines(result.draft.lines);
      setCustomerId(result.draft.customerId ?? "");
      setDiscountPct(result.draft.discountPercent);
      setListId(result.draft.priceListId ?? "");
      setMode(result.draft.mode);
      setSaleType(result.draft.saleType);
      setPaying(false);
      setMessage("");
      setError("");
    });
    return () => {
      cancelled = true;
      setLoadingDraft(false);
    };
  }, [urlDraft]);

  const list = lists.find((item) => item.id === listId) ?? null;
  const parents = sellable.filter((product) => !product.parentId);

  const visible = parents.filter((product) => {
    const text = query.trim().toLowerCase();
    const matchesText = !text || product.name.toLowerCase().includes(text) || product.internalCode.toLowerCase().includes(text);
    return matchesText && (!categoryId || product.categoryId === categoryId);
  });

  const priced = useMemo(() => {
    return lines.flatMap((line) => {
      const product = sellable.find((item) => item.id === line.productId);
      const presentation = product?.presentations.find((item) => item.id === line.presentationId);
      if (!product || !presentation) {
        return [{ ...line, name: "Producto no disponible", unitPrice: "0.00", total: 0, short: true }];
      }
      const unitPrice = resolveUnitPriceText({
        product,
        presentation,
        mode,
        listItems: list?.items,
      });
      let total = 0;
      try {
        total = mulScale(toMoneyInt(unitPrice), toQtyInt(line.quantity || "0"));
      } catch {
        total = 0;
      }
      const base = (() => {
        try {
          return mulScale(toQtyInt(line.quantity || "0"), toFactorInt(presentation.factorToBase));
        } catch {
          return 0;
        }
      })();
      const stock = toQtyInt(product.stock || "0");
      return [{ ...line, name: `${product.name} · ${presentation.name}`, unitPrice, total, short: base > stock }];
    });
  }, [lines, sellable, mode, list]);

  const subtotal = priced.reduce((sum, line) => sum + line.total, 0);
  const discount = Math.min(subtotal, Math.round((subtotal * Number(discountPct || 0)) / 100));
  const total = subtotal - discount;
  const overLimit = Number(discountPct || 0) > discountLimit;

  useEffect(() => {
    if (!wantCharge || loadingDraft || !urlDraft || appliedId.current !== urlDraft || lines.length === 0 || total <= 0) return;
    if (chargeFor.current === urlDraft) return;
    chargeFor.current = urlDraft || "venta";
    setPaying(true);
    setPayments([{ method: "CASH", amount: fromMoneyInt(total).toFixed(2), reference: "" }]);
  }, [wantCharge, loadingDraft, urlDraft, lines.length, total]);

  function changeDiscount(value: string) {
    setDiscountPct(value);
    const nextDiscount = Math.min(subtotal, Math.round((subtotal * Number(value || 0)) / 100));
    const nextTotal = subtotal - (Number.isFinite(nextDiscount) ? nextDiscount : 0);
    setPayments((current) => current.length === 1 ? [{ ...current[0], amount: fromMoneyInt(nextTotal).toFixed(2) }] : current);
  }

  useEffect(() => {
    if (!paying) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setPaying(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paying, pending]);

  function ensureKey() {
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    return keyRef.current;
  }

  function add(product: CatalogProduct, presentationId?: string) {
    if (product.hasVariants && !presentationId && !product.parentId) {
      setVariantsOf(product.id);
      return;
    }
    const presentation = product.presentations.find((item) => item.id === presentationId) ?? product.presentations.find((item) => item.isDefault) ?? product.presentations[0];
    if (!presentation) {
      setMessage("El producto no tiene presentación");
      return;
    }
    setLines((current) => {
      const index = current.findIndex((line) => line.productId === product.id && line.presentationId === presentation.id);
      if (index >= 0) {
        const next = [...current];
        const quantity = toQtyInt(next[index].quantity || "0") + toQtyInt("1");
        next[index] = { ...next[index], quantity: formatQty(quantity) };
        return next;
      }
      return [...current, { productId: product.id, presentationId: presentation.id, quantity: "1" }];
    });
    setMessage("");
    setVariantsOf(null);
  }

  function onCode(code: string) {
    const product = sellable.find((item) => item.barcodes.some((barcode) => barcode.code === code));
    if (!product) {
      setMessage("Código no registrado");
      return;
    }
    const barcode = product.barcodes.find((item) => item.code === code);
    add(product, barcode?.presentationId || undefined);
    setQuery("");
  }

  function commitSearch(raw?: string) {
    const text = (raw ?? query).trim();
    if (!text) return;
    const byCode = sellable.find((item) => item.barcodes.some((barcode) => barcode.code === text) || item.internalCode.toLowerCase() === text.toLowerCase());
    if (byCode) {
      const barcode = byCode.barcodes.find((item) => item.code === text);
      add(byCode, barcode?.presentationId || undefined);
      setQuery("");
      return;
    }
    if (/^\d{6,}$/.test(text)) {
      setMessage("Código no registrado");
      return;
    }
    if (visible.length === 1) {
      add(visible[0]);
      setQuery("");
    }
  }

  async function charge() {
    setError("");
    setStatus("");
    if (!sessionOpen) {
      setError("Abre una caja antes de cobrar");
      return;
    }
    if (priced.some((line) => line.short)) {
      setError("Hay productos sin stock suficiente");
      return;
    }
    if (saleType === "CREDIT" && !customerId) {
      setError("Elige el cliente del crédito");
      return;
    }
    const problem = checkoutProblem(docKind, buyer, total);
    if (problem) {
      setError(problem);
      return;
    }
    setPending(true);
    setStatus("Cobrando…");
    const payload = {
      idempotencyKey: ensureKey(),
      draftId: undefined,
      customerId: customerId || undefined,
      priceListId: listId || undefined,
      mode,
      discount: fromMoneyInt(discount).toFixed(2),
      saleType,
      lines: lines.map(({ productId, presentationId, quantity }) => ({ productId, presentationId, quantity })),
      payments:
        saleType === "CREDIT"
          ? [{ method: "CREDIT" as const, amount: fromMoneyInt(total).toFixed(2) }]
          : payments.map((payment) => ({ method: payment.method, amount: payment.amount || "0", reference: payment.reference })),
    };
    const result = await confirmSaleAction(payload);
    if (!result.ok) {
      setPending(false);
      setStatus("");
      setError(result.error);
      return;
    }
    setLines([]);
    keyRef.current = "";

    const printSafe = async (task: Promise<void>) => {
      await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, 8000))]).catch(() => undefined);
    };

    if (docKind === "NOTA") {
      setStatus("Imprimiendo nota de venta…");
      await printSafe(printSaleTicket(result.id));
      setPending(false);
      setPaying(false);
      window.location.href = `/ventas/${result.id}`;
      return;
    }

    setStatus("Creando comprobante…");
    const issued = await checkoutDocumentAction(result.id, docKind, buyer);
    if (!issued.ok) {
      setPending(false);
      setStatus("");
      setError(`Venta cobrada. No se pudo crear el comprobante: ${issued.error}`);
      window.location.href = `/ventas/${result.id}`;
      return;
    }

    try {
      await emitDocument(issued.id, setStatus);
      setStatus("Imprimiendo comprobante…");
      await printSafe(printDocumentTicket(issued.id));
      setPending(false);
      setPaying(false);
      window.location.href = `/facturacion/${issued.id}`;
    } catch (emitError) {
      setPending(false);
      setStatus("");
      setError(emitError instanceof Error ? emitError.message : "La venta se cobró, pero no se pudo emitir. Revisa el comprobante.");
      window.location.href = `/facturacion/${issued.id}`;
    }
  }

  async function park() {
    setPending(true);
    const result = await saveDraftAction({
      idempotencyKey: ensureKey(),
      customerId: customerId || undefined,
      priceListId: listId || undefined,
      mode,
      discount: fromMoneyInt(discount).toFixed(2),
      saleType,
      lines,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLines([]);
    keyRef.current = "";
    appliedId.current = "";
    setMessage("Venta guardada como pendiente");
    if (urlDraft) router.replace("/ventas");
  }

  const variants = variantsOf ? sellable.filter((product) => product.parentId === variantsOf) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-3">
        {!sessionOpen ? <ErrorText>No hay caja abierta. Puedes armar la venta, pero el cobro exige una caja.</ErrorText> : null}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitSearch(event.currentTarget.value);
              }
            }}
            placeholder="Buscar nombre, código interno o escanear"
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <ScannerButton onCode={onCode} />
        </div>
        <CodeField onCode={onCode} autoFocus placeholder="Lector USB o Bluetooth" />
        {message ? <p className="text-sm text-amber-700">{message}</p> : null}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setCategoryId("")} className={`rounded-full px-3 py-1.5 text-sm shadow-sm ${categoryId === "" ? "pf-button" : "bg-white text-slate-700"}`}>Todos</button>
          {categories.map((category) => (
            <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap shadow-sm ${categoryId === category.id ? "pf-button" : "bg-white text-slate-700"}`}>
              {category.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => {
            const presentation = product.presentations.find((item) => item.isDefault) ?? product.presentations[0];
            const price = presentation
              ? resolveUnitPriceText({ product, presentation, mode, listItems: list?.items })
              : product.salePrice;
            return (
              <button key={product.id} type="button" onClick={() => add(product)} className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary sm:gap-3 sm:p-3">
                <ProductPhoto name={product.name} imagePath={product.imagePath} className="h-10 w-10 shrink-0 sm:h-12 sm:w-12" />
                <span className="min-w-0 break-words">
                  <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
                  <p className="mt-1 text-sm font-semibold text-primary">{formatMoney(toMoneyInt(price), currency)}</p>
                  <p className="text-xs text-slate-500">Stock {product.stock} {product.baseUnit}</p>
                </span>
              </button>
            );
          })}
        </div>
        {variantsOf ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-sm font-medium">Elige la variante</p>
            <div className="flex flex-wrap gap-2">
              {variants.map((variant) => (
                <button key={variant.id} type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => add(variant)}>
                  {variant.variantName || variant.name} · {variant.stock}
                </button>
              ))}
              <button type="button" className="text-sm text-slate-500" onClick={() => setVariantsOf(null)}>Cancelar</button>
            </div>
          </div>
        ) : null}
      </section>
      <aside id="cart" className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--pf-shadow)]">
          <h2 className="font-semibold text-navy">Carrito</h2>
          <div className="mt-3 space-y-3">
            {loadingDraft ? <p className="text-sm text-slate-500">Cargando la venta pendiente…</p> : null}
            {!loadingDraft && priced.length === 0 ? <p className="text-sm text-slate-500">Sin productos</p> : null}
            {priced.map((line) => (
              <div key={`${line.productId}-${line.presentationId}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{line.name}</p>
                  <button type="button" className="text-xs text-red-700" onClick={() => setLines((current) => current.filter((item) => !(item.productId === line.productId && item.presentationId === line.presentationId)))}>Quitar</button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId && item.presentationId === line.presentationId ? { ...item, quantity: event.target.value } : item))} className="h-9 w-20 rounded-xl border border-slate-200 px-2 text-sm" />
                  <span className="text-sm text-slate-500">{formatMoney(toMoneyInt(line.unitPrice), currency)}</span>
                  <span className="ml-auto text-sm font-medium">{formatMoney(line.total, currency)}</span>
                </div>
                {line.short ? <p className="text-xs text-red-700">Stock insuficiente</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t pt-3 text-sm">
            <label className="block">Precio
              <select value={mode} onChange={(event) => setMode(event.target.value as PriceMode)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-2">
                <option value="SALE">Precio de venta</option>
                <option value="RETAIL">Minorista</option>
                <option value="WHOLESALE">Mayorista</option>
              </select>
            </label>
            <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(subtotal, currency)}</span></div>
            <div className="flex justify-between"><span>Descuento</span><span>{formatMoney(discount, currency)}</span></div>
            <div className="flex justify-between text-lg font-semibold text-navy"><span>Total</span><span>{formatMoney(total, currency)}</span></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="flex-1" disabled={pending || loadingDraft || priced.length === 0} onClick={() => { setError(""); setStatus(""); setPaying(true); setPayments([{ method: "CASH", amount: fromMoneyInt(total).toFixed(2), reference: "" }]); }}>Cobrar</Button>
            <Button type="button" variant="secondary" disabled={pending || loadingDraft || priced.length === 0} onClick={park}>Pendiente</Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      </aside>
      {paying ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-label="Cobro" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) setPaying(false); }}>
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl">
            <ChargeWindow
              total={total}
              currency={currency}
              payments={payments}
              onPayments={setPayments}
              allowCredit={allowCredit && canCredit}
              saleType={saleType}
              onSaleType={setSaleType}
              pending={pending}
              error={error}
              status={status}
              confirmLabel={docKind === "NOTA" ? "Cobrar e imprimir" : "Cobrar, emitir e imprimir"}
              onConfirm={charge}
              onClose={() => setPaying(false)}
            >
              <CheckoutDocument kind={docKind} onKind={setDocKind} buyer={buyer} onBuyer={setBuyer} disabled={pending} />
              <label className="mt-3 block text-sm text-slate-700">Descuento %
                <input value={discountPct} disabled={pending} onChange={(event) => changeDiscount(event.target.value)} inputMode="decimal" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-2 disabled:bg-slate-50" />
              </label>
              {overLimit ? <p className="mt-1 text-xs text-amber-700">Supera el tope de {discountLimit}%. Solo un administrador puede cobrarlo.</p> : null}
              {discount > 0 ? <p className="mt-1 text-xs text-slate-500">Subtotal {formatMoney(subtotal, currency)} · descuento {formatMoney(discount, currency)}</p> : null}
              {saleType === "CREDIT" ? (
                <label className="mt-3 block text-sm text-slate-700">Cliente
                  <select value={customerId} disabled={pending} onChange={(event) => setCustomerId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-2 disabled:bg-slate-50">
                    <option value="">Elige el cliente</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                  </select>
                </label>
              ) : null}
            </ChargeWindow>
          </div>
        </div>
      ) : null}
    </div>
  );
}
