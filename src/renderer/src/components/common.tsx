import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Film, Image as ImageIcon, Info, Music, X, XCircle } from 'lucide-react';
import type { ItemKind, PresentableItem } from '../../../shared/types';
import { itemThumbnail } from '../lib/format';
import { dismissNotification, useNotifications } from '../lib/stores';

export function KindIcon({ kind, size = 14 }: { kind: ItemKind; size?: number }) {
  if (kind === 'image') return <ImageIcon size={size} />;
  if (kind === 'video') return <Film size={size} />;
  return <Music size={size} />;
}

export function ItemThumb({ item }: { item: PresentableItem }) {
  const src = itemThumbnail(item);
  const [failed, setFailed] = useState(false);
  return (
    <div className="thumb">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <KindIcon kind={item.kind} size={16} />
      )}
    </div>
  );
}

/** A two-step button: the first click arms it, the second confirms. Avoids modal dialogs. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirm?',
  className = 'btn sm danger',
  title,
  disabled
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

const TOAST_ICON = {
  info: <Info size={16} />,
  success: <CheckCircle2 size={16} color="#22c55e" />,
  warning: <AlertTriangle size={16} color="#f59e0b" />,
  error: <XCircle size={16} color="#ef4444" />
};

export function Toasts() {
  const notifications = useNotifications();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`toast ${n.level}`}>
          {TOAST_ICON[n.level]}
          <div className="grow">{n.message}</div>
          <button type="button" className="btn sm icon ghost" aria-label="Dismiss" onClick={() => dismissNotification(n.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-row">
      <div>
        <div className="label">{label}</div>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}
