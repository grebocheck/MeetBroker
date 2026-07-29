import {
  AnchorHTMLAttributes,
  MouseEvent,
  useEffect,
  useState
} from "react";

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState({}, "", path);
  else window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(
    window.location.pathname + window.location.search
  );
  useEffect(() => {
    const listener = () =>
      setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  return path;
}

export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      navigate(href);
    }
  };
  return <a href={href} onClick={handleClick} {...props} />;
}
