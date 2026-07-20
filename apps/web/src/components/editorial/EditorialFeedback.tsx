import { useEffect } from 'react';

export type EditorialToastTone = 'success' | 'error' | 'info' | 'warning';

function inferTone(message: string): EditorialToastTone {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('no fue posible') ||
    normalized.includes('error') ||
    normalized.includes('falló') ||
    normalized.includes('incorrect') ||
    normalized.includes('no está disponible')
  ) {
    return 'error';
  }

  if (
    normalized.includes('correctamente') ||
    normalized.includes('completada') ||
    normalized.includes('guardada') ||
    normalized.includes('actualizada') ||
    normalized.includes('publicada') ||
    normalized.includes('activada') ||
    normalized.includes('enviada')
  ) {
    return 'success';
  }

  return 'info';
}

interface EditorialToastProps {
  message: string;
  tone?: EditorialToastTone;
  onClose: () => void;
  durationMs?: number;
}

export function EditorialToast({
  message,
  tone = inferTone(message),
  onClose,
  durationMs = 5200,
}: EditorialToastProps) {
  useEffect(() => {
    if (!message || durationMs <= 0) return;

    const timeout = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, message, onClose]);

  if (!message) return null;

  return (
    <div className={`editorial-toast editorial-toast--${tone}`} role="status" aria-live="polite">
      <span className="editorial-toast__icon" aria-hidden="true">
        {tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : 'i'}
      </span>
      <p>{message}</p>
      <button type="button" onClick={onClose} aria-label="Cerrar notificación">
        ×
      </button>
      <style>{`
        .editorial-toast{position:fixed;z-index:120;right:24px;bottom:24px;width:min(420px,calc(100vw - 32px));min-height:58px;padding:13px 13px 13px 14px;display:grid;grid-template-columns:30px minmax(0,1fr) 30px;align-items:center;gap:10px;border:1px solid var(--editorial-line,#dfddd7);border-radius:14px;background:#fff;box-shadow:0 22px 55px rgb(20 38 58 / 22%);animation:editorial-toast-in .2s ease both;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .editorial-toast__icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;font-size:.86rem;font-weight:900}
        .editorial-toast p{margin:0;color:#243140;font-size:.88rem;font-weight:650;line-height:1.4}
        .editorial-toast button{width:30px;height:30px;border:0;border-radius:8px;color:#68737d;background:transparent;font-size:1.25rem;line-height:1;cursor:pointer}
        .editorial-toast button:hover{background:#f2f1ed;color:#14263a}
        .editorial-toast--success{border-color:#c7dfd0}.editorial-toast--success .editorial-toast__icon{color:#246340;background:#e8f3ec}
        .editorial-toast--error{border-color:#efc8cd}.editorial-toast--error .editorial-toast__icon{color:#a33a42;background:#fbeaec}
        .editorial-toast--warning{border-color:#ecd7a8}.editorial-toast--warning .editorial-toast__icon{color:#8a5d12;background:#fff3d8}
        .editorial-toast--info .editorial-toast__icon{color:#772536;background:#f7ecef}
        @keyframes editorial-toast-in{from{opacity:0;transform:translateY(12px) scale(.98)}}
        @media(max-width:620px){.editorial-toast{right:16px;bottom:16px}}
      `}</style>
    </div>
  );
}

interface EditorialLoadingOverlayProps {
  visible: boolean;
  label?: string;
  page?: boolean;
}

export function EditorialLoadingOverlay({
  visible,
  label = 'Procesando…',
  page = false,
}: EditorialLoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={`editorial-loading${page ? ' editorial-loading--page' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="editorial-loading__panel">
        <span className="editorial-loading__spinner" aria-hidden="true"></span>
        <strong>{label}</strong>
        <small>Espera un momento, estamos completando la operación.</small>
      </div>
      <style>{`
        .editorial-loading{position:fixed;z-index:110;inset:0;display:grid;place-items:center;padding:24px;background:rgb(244 243 239 / 72%);backdrop-filter:blur(2px);border-radius:inherit}
        .editorial-loading--page{border-radius:0;background:rgb(255 255 255 / 78%)}
        .editorial-loading__panel{min-width:230px;padding:22px 24px;display:grid;justify-items:center;gap:8px;border:1px solid #dfddd7;border-radius:16px;background:#fff;box-shadow:0 20px 55px rgb(20 38 58 / 16%);font-family:"Segoe UI","Source Sans 3",Arial,sans-serif;text-align:center}
        .editorial-loading__spinner{width:30px;height:30px;margin-bottom:2px;border:3px solid #eadde0;border-top-color:#772536;border-radius:50%;animation:editorial-spin .75s linear infinite}
        .editorial-loading__panel strong{color:#14263a;font-size:.94rem}
        .editorial-loading__panel small{max-width:260px;color:#6b747c;font-size:.76rem;line-height:1.45}
        @keyframes editorial-spin{to{transform:rotate(360deg)}}
      `}</style>
    </div>
  );
}
