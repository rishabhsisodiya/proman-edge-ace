"use client";

import { useRef, useState } from "react";

interface Props {
  onCapture: (blob: Blob | null) => void;
  disabled?: boolean;
}

// Minimal HTML5 canvas signature capture — no external library, just
// pointer-event drawing exported as a PNG blob for upload (per §8.4 —
// signatures belong in the same document-storage layer as photos, not
// stored inline as a base64 string).
export default function SignaturePad({ onCapture, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = getPos(e);
    ctx?.beginPath();
    ctx?.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    const { x, y } = getPos(e);
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#2A2F69";
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    setHasDrawn(true);
  }

  function end() {
    // Guard on drawing.current *before* resetting it — pointerleave fires on
    // every mouse-hover-out, drawn or not, so without this a signature that
    // was captured once gets silently re-uploaded on every subsequent hover.
    const wasDrawing = drawing.current;
    drawing.current = false;
    if (wasDrawing && hasDrawn && canvasRef.current) {
      canvasRef.current.toBlob((blob) => onCapture(blob), "image/png");
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onCapture(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className={`w-full max-w-sm touch-none rounded-md border border-line bg-white ${disabled ? "opacity-50" : ""}`}
      />
      {!disabled && (
        <button type="button" onClick={clear} className="mt-1 text-xs font-bold text-brand-red">
          Clear
        </button>
      )}
    </div>
  );
}
