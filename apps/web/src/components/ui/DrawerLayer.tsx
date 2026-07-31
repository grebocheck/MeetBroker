import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ModalLayer } from "./ModalLayer";

type CloseDrawer = (afterClose?: () => void) => void;

export function DrawerLayer({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: (close: CloseDrawer) => ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback((afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(
      () => (afterClose ?? onCloseRef.current)(),
      180,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, [close]);

  return (
    <ModalLayer
      className={`drawer-backdrop${closing ? " is-closing" : ""}`}
      onDismiss={() => close()}
      onMouseDown={() => close()}
    >
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children(close)}
      </aside>
    </ModalLayer>
  );
}
