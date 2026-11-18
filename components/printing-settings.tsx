"use client";

import { Button, Card, Field, Label, Select } from "@/components/ui";
import {
  ASSISTANT_DOWNLOAD_URL,
  discover,
  efactReachable,
  listPrinters,
  printerStatus,
  probe,
  readCashierPrinter,
  readPrefs,
  saveCashierPrinter,
  saveOrigin,
  savePrefs,
  savedOrigin,
  testPrint,
} from "@/lib/local-assistant";
import { useEffect, useState } from "react";

type Link = "buscando" | "conectado" | "sin-asistente";

export function PrintingSettings() {
  const [link, setLink] = useState<Link>("buscando");
  const [origin, setOrigin] = useState("");
  const [manual, setManual] = useState("");
  const [printers, setPrinters] = useState<string[]>([]);
  const [tipo, setTipo] = useState<"usb" | "red">("usb");
  const [nombre, setNombre] = useState("");
  const [ip, setIp] = useState("");
  const [puerto, setPuerto] = useState("9100");
  const [paper, setPaper] = useState<58 | 80>(80);
  const [autoPrint, setAutoPrint] = useState(false);
  const [efact, setEfact] = useState<boolean | null>(null);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function connect(candidate?: string, first = false) {
    if (first) {
      const prefs = readPrefs();
      setAutoPrint(prefs.autoPrint);
      setPaper(prefs.paperWidth);
    }
    setLink("buscando");
    setMessage("");
    setFailed(false);
    if (candidate !== undefined) {
      if (!(await probe(candidate))) {
        setLink("sin-asistente");
        setFailed(true);
        setMessage("Esa dirección no responde como asistente de impresión");
        return;
      }
      saveOrigin(candidate);
    }
    const found = await discover();
    setOrigin(found);
    setManual(found || savedOrigin() || "http://127.0.0.1:3002");
    if (!found) {
      setLink("sin-asistente");
      setEfact(false);
      return;
    }
    setLink("conectado");
    try {
      const [names, current, state] = await Promise.all([listPrinters(), readCashierPrinter(), printerStatus().catch(() => null)]);
      setPrinters(names);
      setTipo(current.tipo);
      setNombre(current.nombre);
      setIp(current.ip);
      setPuerto(String(current.puerto || 9100));
      setPaper(current.paperWidth);
      setStatus(state?.label ?? "");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo leer la impresora");
    }
    setEfact(await efactReachable());
  }

  useEffect(() => {
    void Promise.resolve().then(() => connect(undefined, true));
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      savePrefs({ autoPrint, paperWidth: paper });
      await saveCashierPrinter({ tipo, nombre, ip, puerto: Number(puerto) || 9100, paperWidth: paper });
      const state = await printerStatus().catch(() => null);
      setStatus(state?.label ?? "");
      setMessage("Impresora guardada en el asistente");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await testPrint();
      setMessage("Prueba enviada a la ticketera");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "No se pudo imprimir la prueba");
    } finally {
      setBusy(false);
    }
  }

  const badge = link === "conectado" ? "bg-emerald-50 text-emerald-700" : link === "buscando" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Asistente de impresión</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge}`}>
          {link === "conectado" ? "Conectado" : link === "buscando" ? "Buscando…" : "No encontrado"}
        </span>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Es el programa Fadey Impresión instalado en la PC de caja. Imprime los tickets en la ticketera y firma los comprobantes para SUNAT. La conexión queda guardada en este navegador.
      </p>

      {link === "sin-asistente" ? (
        <div className="mb-4 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
          No responde en esta PC. Abre Fadey Impresión desde el menú de Windows o instálalo.
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={ASSISTANT_DOWNLOAD_URL} className="pf-button inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium">Descargar asistente</a>
            <Button type="button" variant="secondary" className="h-9" onClick={() => void connect()}>Buscar de nuevo</Button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Label>Dirección del asistente</Label>
          <Field value={manual} onChange={(event) => setManual(event.target.value)} placeholder="http://127.0.0.1:3002" />
        </div>
        <Button type="button" variant="secondary" className="self-end" onClick={() => void connect(manual)}>Conectar</Button>
      </div>
      {origin ? <p className="-mt-2 mb-4 text-xs text-slate-500">En uso: {origin}{status ? ` · Ticketera: ${status}` : ""}</p> : null}

      <fieldset disabled={link !== "conectado" || busy} className="grid gap-3 disabled:opacity-60 sm:grid-cols-2">
        <div>
          <Label>Conexión de la ticketera</Label>
          <Select value={tipo} onChange={(event) => setTipo(event.target.value === "red" ? "red" : "usb")}>
            <option value="usb">USB (instalada en Windows)</option>
            <option value="red">Red (IP)</option>
          </Select>
        </div>
        <div>
          <Label>Ancho del papel</Label>
          <Select value={paper} onChange={(event) => setPaper(event.target.value === "58" ? 58 : 80)}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </Select>
        </div>
        {tipo === "usb" ? (
          <div className="sm:col-span-2">
            <Label>Impresora</Label>
            <Select value={nombre} onChange={(event) => setNombre(event.target.value)}>
              <option value="">Elige la ticketera</option>
              {printers.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </div>
        ) : (
          <>
            <div><Label>IP</Label><Field value={ip} onChange={(event) => setIp(event.target.value)} placeholder="192.168.1.50" /></div>
            <div><Label>Puerto</Label><Field value={puerto} onChange={(event) => setPuerto(event.target.value)} inputMode="numeric" /></div>
          </>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={autoPrint} onChange={(event) => setAutoPrint(event.target.checked)} />
          Imprimir el ticket al cobrar una venta
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="button" onClick={save}>Guardar impresora</Button>
          <Button type="button" variant="secondary" onClick={test}>Imprimir prueba</Button>
        </div>
      </fieldset>

      {message ? <p className={`mt-3 text-sm ${failed ? "text-red-700" : "text-teal-700"}`}>{message}</p> : null}

      <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
        <p className="font-medium text-navy">Facturación por el asistente</p>
        <p className="mt-1 text-slate-500">
          {efact === null ? "Revisando…" : efact ? "El servicio de SUNAT del asistente responde en esta PC." : "El servicio de SUNAT del asistente no responde en esta PC."}
        </p>
      </div>
    </Card>
  );
}
