"use client";

import { closeCashBoardAction } from "@/actions/operations";
import { Button, ErrorText, Field, Label } from "@/components/ui";
import { CASH_DENOMS, denomTotalCents, emptyDenominations, type DenomKey } from "@/lib/denominations";
import { formatMoney, fromMoneyInt, toMoneyInt } from "@/lib/money";
import Check from "lucide-react/icons/check";
import Minus from "lucide-react/icons/minus";
import Plus from "lucide-react/icons/plus";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PosRow = { code: string; label: string; expected: number };

export function CashArqueo({
  currency,
  registerName,
  opening,
  expectedCash,
  income,
  expense,
  byMethod,
  posRows,
}: {
  currency: string;
  registerName: string;
  opening: number;
  expectedCash: number;
  income: number;
  expense: number;
  byMethod: Record<string, number>;
  posRows: PosRow[];
}) {
  const router = useRouter();
  const [denoms, setDenoms] = useState(emptyDenominations);
  const [cashManual, setCashManual] = useState("");
  const [posCounts, setPosCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(posRows.map((row) => [row.code, ""])),
  );
  const [posTotal, setPosTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const denomCents = useMemo(() => denomTotalCents(denoms), [denoms]);
  const cashCounted = useMemo(() => {
    if (cashManual.trim() !== "") {
      try {
        return toMoneyInt(cashManual);
      } catch {
        return denomCents;
      }
    }
    return denomCents;
  }, [cashManual, denomCents]);

  const cashDiff = cashCounted - expectedCash;
  const hasCashCount = cashManual.trim() !== "" || Object.values(denoms).some((value) => Number(value) > 0);
  const cashMissing = !hasCashCount;

  const posExpectedTotal = posRows.reduce((sum, row) => sum + row.expected, 0);
  const posVerified = posRows.map((row) => {
    const raw = posCounts[row.code] ?? "";
    const verified = raw.trim() !== "";
    let counted = row.expected;
    if (verified) {
      try {
        counted = toMoneyInt(raw);
      } catch {
        counted = row.expected;
      }
    }
    return { ...row, verified, counted, difference: counted - row.expected };
  });
  const posCountedSum = posVerified.reduce((sum, row) => sum + row.counted, 0);
  const posTotalCents = (() => {
    if (posTotal.trim() === "") return null;
    try {
      return toMoneyInt(posTotal);
    } catch {
      return null;
    }
  })();
  const posCompare = posTotalCents ?? posCountedSum;
  const posDiff = posCompare - posExpectedTotal;

  const bills = CASH_DENOMS.filter((item) => item.kind === "bill");
  const coins = CASH_DENOMS.filter((item) => item.kind === "coin");

  function setDenom(key: DenomKey, value: string) {
    const clean = value.replace(/[^\d]/g, "");
    const next = { ...denoms, [key]: clean };
    setDenoms(next);
    setCashManual(fromMoneyInt(denomTotalCents(next)).toFixed(2));
  }

  function stepDenom(key: DenomKey, delta: number) {
    const current = Math.max(0, Math.floor(Number(denoms[key] || 0)) + delta);
    setDenom(key, String(Math.max(0, current)));
  }

  function markPosCorrect(code?: string) {
    if (code) {
      const row = posRows.find((item) => item.code === code);
      if (!row) return;
      setPosCounts((current) => ({ ...current, [code]: fromMoneyInt(row.expected).toFixed(2) }));
      return;
    }
    setPosCounts(Object.fromEntries(posRows.map((row) => [row.code, fromMoneyInt(row.expected).toFixed(2)])));
    setPosTotal(fromMoneyInt(posExpectedTotal).toFixed(2));
  }

  function advanceFrom(key: string) {
    const order = [...CASH_DENOMS.map((item) => item.key), ...posRows.map((row) => `pos_${row.code}`), "pos_total"];
    const index = order.indexOf(key);
    const next = order[index + 1];
    if (!next) return;
    fieldRefs.current[next]?.focus();
    fieldRefs.current[next]?.select();
  }

  async function submit() {
    setPending(true);
    setError("");
    const denomLines = CASH_DENOMS.filter((item) => Number(denoms[item.key] || 0) > 0)
      .map((item) => `${item.label}×${denoms[item.key]}`)
      .join(", ");
    const posLines = posVerified
      .map((row) => `${row.label}: sistema ${fromMoneyInt(row.expected).toFixed(2)} / contado ${fromMoneyInt(row.counted).toFixed(2)}${row.verified ? "" : " (sistema)"}`)
      .join("; ");
    const detail = [
      denomLines ? `Denominaciones: ${denomLines}` : null,
      `Efectivo contado: ${fromMoneyInt(cashCounted).toFixed(2)} · esperado ${fromMoneyInt(expectedCash).toFixed(2)} · diff ${fromMoneyInt(cashDiff).toFixed(2)}`,
      posLines ? `POS/otros: ${posLines}` : null,
      posTotalCents != null ? `Total POS declarado: ${fromMoneyInt(posTotalCents).toFixed(2)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await closeCashBoardAction({
      counted: fromMoneyInt(cashCounted).toFixed(2),
      notes,
      arqueoDetail: detail,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/caja/historial");
    router.refresh();
  }

  function statusBox(diff: number, missing: boolean) {
    if (missing) return { title: "Falta contar", sub: "Ingresa billetes y monedas", tone: "border-slate-200 bg-slate-50 text-slate-600" };
    if (diff === 0) return { title: "Cuadra", sub: "Sin diferencias", tone: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    if (diff > 0) return { title: "Sobrante", sub: "Hay más de lo esperado", tone: "border-sky-200 bg-sky-50 text-sky-800" };
    return { title: "Faltante", sub: "Hay menos de lo esperado", tone: "border-red-200 bg-red-50 text-red-800" };
  }

  const cashStatus = statusBox(cashDiff, cashMissing);
  const posStatus = statusBox(posDiff, posTotalCents == null && posVerified.every((row) => !row.verified));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-navy">{registerName}</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Efectivo inicial</dt><dd>{formatMoney(opening, currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Ventas en efectivo</dt><dd>{formatMoney(byMethod.CASH ?? 0, currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Ingresos</dt><dd>{formatMoney(income, currency)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Egresos</dt><dd>{formatMoney(expense, currency)}</dd></div>
          <div className="flex justify-between gap-3 font-semibold text-navy sm:col-span-2"><dt>Efectivo esperado</dt><dd>{formatMoney(expectedCash, currency)}</dd></div>
        </dl>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-navy">Conteo rápido de efectivo</h3>
        <p className="mt-1 text-xs text-slate-500">Indica cuántos billetes y monedas hay. El total se calcula solo; puedes corregirlo a mano.</p>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-navy">Billetes</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {bills.map((item) => (
              <DenomCard
                key={item.key}
                label={item.label}
                value={denoms[item.key]}
                subtotal={formatMoney(Math.round((Number(denoms[item.key] || 0) || 0) * item.value * 100), currency)}
                inputRef={(el) => {
                  fieldRefs.current[item.key] = el;
                }}
                onChange={(value) => setDenom(item.key, value)}
                onStep={(delta) => stepDenom(item.key, delta)}
                onEnter={() => advanceFrom(item.key)}
              />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-navy">Monedas</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {coins.map((item) => (
              <DenomCard
                key={item.key}
                label={item.label}
                value={denoms[item.key]}
                subtotal={formatMoney(Math.round((Number(denoms[item.key] || 0) || 0) * item.value * 100), currency)}
                inputRef={(el) => {
                  fieldRefs.current[item.key] = el;
                }}
                onChange={(value) => setDenom(item.key, value)}
                onStep={(delta) => stepDenom(item.key, delta)}
                onEnter={() => advanceFrom(item.key)}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <Label>Total contado</Label>
            <Field
              value={cashManual}
              onChange={(event) => setCashManual(event.target.value)}
              inputMode="decimal"
              placeholder={fromMoneyInt(denomCents).toFixed(2)}
            />
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-medium text-violet-900">Efectivo en sistema</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-navy">{formatMoney(expectedCash, currency)}</p>
          </div>
          <div className={`rounded-xl border p-3 ${cashStatus.tone}`}>
            <p className="text-xs font-medium">Diferencia</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {cashMissing ? "—" : `${cashDiff > 0 ? "+" : ""}${formatMoney(cashDiff, currency)}`}
            </p>
            <p className="mt-1 text-xs">{cashStatus.title} · {cashStatus.sub}</p>
          </div>
        </div>
      </section>

      {posRows.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-navy">Confirmación POS / otros medios</h3>
              <p className="mt-1 text-xs text-slate-500">Compara el total del datáfono o apps con lo registrado en el sistema.</p>
            </div>
            <button
              type="button"
              onClick={() => markPosCorrect()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-800"
            >
              <Check size={16} />
              Todo correcto
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[12rem] flex-1">
                <Label>Total en el POS</Label>
                <Field
                  ref={(el) => {
                    fieldRefs.current.pos_total = el;
                  }}
                  value={posTotal}
                  onChange={(event) => setPosTotal(event.target.value)}
                  inputMode="decimal"
                  placeholder={fromMoneyInt(posExpectedTotal).toFixed(2)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      advanceFrom("pos_total");
                    }
                  }}
                />
              </div>
              <div className="text-right text-sm">
                <p className="text-xs text-slate-500">Sistema</p>
                <p className="font-semibold text-navy">{formatMoney(posExpectedTotal, currency)}</p>
                <p className={`text-xs ${posStatus.tone.includes("emerald") ? "text-emerald-700" : posStatus.tone.includes("red") ? "text-red-700" : "text-slate-500"}`}>
                  {posTotalCents == null && posVerified.every((row) => !row.verified)
                    ? "Opcional"
                    : posDiff === 0
                      ? "Cuadra"
                      : `${posDiff > 0 ? "Sobrante" : "Faltante"} ${formatMoney(Math.abs(posDiff), currency)}`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {posVerified.map((row) => {
              const st = !row.verified ? "pending" : row.difference === 0 ? "ok" : row.difference > 0 ? "over" : "short";
              const tone =
                st === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : st === "over"
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : st === "short"
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-slate-200 bg-white text-slate-600";
              return (
                <div key={row.code} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-navy">{row.label}</p>
                    <div className="text-right text-xs">
                      <p className="text-slate-500">Sistema</p>
                      <p className="font-semibold text-navy">{formatMoney(row.expected, currency)}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Field
                      ref={(el) => {
                        fieldRefs.current[`pos_${row.code}`] = el;
                      }}
                      value={posCounts[row.code] ?? ""}
                      onChange={(event) => setPosCounts((current) => ({ ...current, [row.code]: event.target.value }))}
                      inputMode="decimal"
                      placeholder={fromMoneyInt(row.expected).toFixed(2)}
                      className="flex-1"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          advanceFrom(`pos_${row.code}`);
                        }
                      }}
                    />
                    {st === "pending" ? (
                      <Button type="button" variant="secondary" onClick={() => markPosCorrect(row.code)}>
                        Correcto
                      </Button>
                    ) : (
                      <span className={`inline-flex items-center rounded-xl border px-3 text-xs font-medium ${tone}`}>
                        {st === "ok" ? "Cuadra" : st === "over" ? "Sobrante" : "Faltante"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Label>Notas del cierre</Label>
        <Field value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Observaciones opcionales" />
        <ErrorText>{error}</ErrorText>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={pending || cashMissing} onClick={submit}>
            {pending ? "Cerrando…" : "Cerrar caja"}
          </Button>
        </div>
        {cashMissing ? <p className="mt-2 text-xs text-amber-700">Completa el conteo de efectivo para cerrar.</p> : null}
      </div>
    </div>
  );
}

function DenomCard({
  label,
  value,
  subtotal,
  onChange,
  onStep,
  onEnter,
  inputRef,
}: {
  label: string;
  value: string;
  subtotal: string;
  onChange: (value: string) => void;
  onStep: (delta: number) => void;
  onEnter: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-center">
      <p className="text-sm font-semibold text-navy">{label}</p>
      <div className="mt-2 flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button type="button" tabIndex={-1} className="grid size-9 place-items-center text-slate-600 hover:bg-slate-100 disabled:opacity-40" disabled={!Number(value)} onClick={() => onStep(-1)} aria-label={`Quitar ${label}`}>
          <Minus size={14} />
        </button>
        <input
          ref={inputRef}
          value={value}
          inputMode="numeric"
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (value === "") onChange("0");
              onEnter();
            }
          }}
          className="h-9 w-full min-w-0 border-x border-slate-200 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
          placeholder="0"
        />
        <button type="button" tabIndex={-1} className="grid size-9 place-items-center text-slate-600 hover:bg-slate-100" onClick={() => onStep(1)} aria-label={`Agregar ${label}`}>
          <Plus size={14} />
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Subtotal {subtotal}</p>
    </div>
  );
}
