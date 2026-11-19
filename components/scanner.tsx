"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat } from "@zxing/library";
import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui";
import Camera from "lucide-react/icons/camera";

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

/** Pit corto al leer un código (cámara o lector). */
export function playScanPit() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const audio = new Ctx();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = 1400;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.09);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.1);
    window.setTimeout(() => void audio.close(), 250);
  } catch {
    /* noop */
  }
}

export function CodeField({
  onCode,
  placeholder = "Escanear con lector y Enter, o escribir el código",
  autoFocus = false,
  inputRef,
}: {
  onCode: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [value, setValue] = useState("");
  return (
    <input
      ref={inputRef}
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const code = event.currentTarget.value.trim();
        if (!code) return;
        onCode(code);
        setValue("");
      }}
      placeholder={placeholder}
      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
    />
  );
}

export function ScannerButton({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" className="h-12 shrink-0 gap-1.5 px-3" onClick={() => setOpen(true)}>
        <Camera size={16} />
        Cámara
      </Button>
      {open ? <ScannerDialog onClose={() => setOpen(false)} onCode={onCode} /> : null}
    </>
  );
}

function ScannerDialog({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [hit, setHit] = useState("");
  const [ready, setReady] = useState(true);
  const last = useRef({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let stopped = false;
    let stopCamera = () => undefined as void;
    const reader = new BrowserMultiFormatReader();
    reader.possibleFormats = FORMATS;

    BrowserMultiFormatReader.listVideoInputDevices()
      .then(async (list) => {
        if (stopped) return;
        setDevices(list);
        const preferred = list.find((item) => /back|trasera|environment|rear/i.test(item.label)) ?? list[0];
        const selected = deviceId || preferred?.deviceId;
        if (!deviceId && selected) setDeviceId(selected);
        const controls = await reader.decodeFromVideoDevice(selected, video, (result) => {
          if (!result || stopped) return;
          const code = result.getText().trim();
          const now = Date.now();
          // Evita doble lectura del mismo frame; permite reescanear el mismo código tras ~0.9 s.
          if (!code || (code === last.current.code && now - last.current.at < 900)) return;
          last.current = { code, at: now };
          setHit(code);
          setReady(false);
          if (navigator.vibrate) navigator.vibrate(60);
          onCodeRef.current(code);
          // “Refresca” la UI para la siguiente lectura sin cerrar la cámara.
          window.setTimeout(() => {
            if (stopped) return;
            setHit("");
            setReady(true);
          }, 450);
        });
        stopCamera = () => controls.stop();
        const track = video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
        const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        setTorchOk(Boolean(capabilities?.torch));
      })
      .catch(() => setError("No se pudo usar la cámara. Revisa el permiso del navegador."));

    return () => {
      stopped = true;
      stopCamera();
    };
  }, [deviceId]);

  async function toggleTorch() {
    const video = videoRef.current;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    if (!track) return;
    const next = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
    setTorchOn(next);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-navy">Escanear código</h2>
            <p className="text-xs text-slate-500">Lee, suma 1 unidad y sigue hasta cerrar.</p>
          </div>
          <button onClick={onClose} type="button" className="text-sm text-slate-500">Cerrar</button>
        </div>
        <video
          ref={videoRef}
          className={`aspect-video w-full rounded-xl bg-black object-cover transition ${hit ? "ring-4 ring-primary" : ready ? "ring-2 ring-slate-200" : ""}`}
          muted
          playsInline
        />
        {hit ? <p className="mt-2 text-sm font-medium text-primary">Leído: {hit} · +1</p> : (
          <p className="mt-2 text-sm text-slate-500">{ready ? "Listo para el siguiente código…" : "Procesando…"}</p>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.length > 1 ? (
            <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-2 text-sm">
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || "Cámara"}</option>
              ))}
            </select>
          ) : null}
          {torchOk ? (
            <Button type="button" variant="secondary" onClick={toggleTorch}>{torchOn ? "Apagar linterna" : "Linterna"}</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
