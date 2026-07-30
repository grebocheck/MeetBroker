import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface ModalLayerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  onDismiss?: () => void;
}

export function ModalLayer({
  children,
  className = "modal-backdrop",
  onDismiss,
  onKeyDown,
  ...props
}: ModalLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const layer = layerRef.current;
    const initial =
      layer?.querySelector<HTMLElement>("[autofocus]") ??
      layer?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
    const frame = window.requestAnimationFrame(() => {
      if (!layer?.contains(document.activeElement)) initial?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus.current?.focus();
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && onDismiss) {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      layerRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      ref={layerRef}
      className={className}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}
