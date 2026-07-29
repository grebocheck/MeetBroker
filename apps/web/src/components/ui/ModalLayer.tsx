import type { HTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalLayerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ModalLayer({
  children,
  className = "modal-backdrop",
  ...props
}: ModalLayerProps) {
  return createPortal(
    <div className={className} {...props}>
      {children}
    </div>,
    document.body,
  );
}
