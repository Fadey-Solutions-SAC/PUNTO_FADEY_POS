"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat } from "@zxing/library";
import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui";

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
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Cámara
      </Button>
      {open ? <ScannerDialog onClose={() => setOpen(false)} onCode={onCode} /> : null}
    </>
  );
}

function beep() {
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.08);
  window.setTimeout(() => audio.close(), 200);
}

function ScannerDialog({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [hit, setHit] = useState("");
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
          if (!result) return;
          const code = result.getText().trim();
          const now = Date.now();
          if (!code || (code === last.current.code && now - last.current.at < 1600)) return;
          last.current = { code, at: now };
          setHit(code);
          if (navigator.vibrate) navigator.vibrate(80);
          beep();
          onCodeRef.current(code);
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
          <h2 className="font-semibold text-navy">Escanear código</h2>
          <button onClick={onClose} type="button" className="text-sm text-slate-500">Cerrar</button>
        </div>
        <video ref={videoRef} className={`aspect-video w-full rounded-xl bg-black object-cover ${hit ? "ring-4 ring-teal-500" : ""}`} muted playsInline />
        {hit ? <p className="mt-2 text-sm text-teal-700">Leído: {hit}</p> : null}
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
