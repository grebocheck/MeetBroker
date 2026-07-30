import { useEffect } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type Direction = "up" | "down" | "left" | "right";

function focusableElements(): HTMLElement[] {
  const scope =
    document.querySelector<HTMLElement>("[aria-modal='true']") ?? document.body;
  return Array.from(
    scope.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      !element.closest("[inert]")
    );
  });
}

function moveFocus(direction: Direction): boolean {
  const candidates = focusableElements();
  if (!candidates.length) return false;
  const current =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!current || !candidates.includes(current)) {
    candidates[0]?.focus();
    candidates[0]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  const origin = current.getBoundingClientRect();
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;
  let best: { element: HTMLElement; score: number } | undefined;

  for (const element of candidates) {
    if (element === current) continue;
    const rect = element.getBoundingClientRect();
    const deltaX = rect.left + rect.width / 2 - originX;
    const deltaY = rect.top + rect.height / 2 - originY;
    const primary =
      direction === "left"
        ? -deltaX
        : direction === "right"
          ? deltaX
          : direction === "up"
            ? -deltaY
            : deltaY;
    if (primary <= 4) continue;
    const secondary =
      direction === "left" || direction === "right"
        ? Math.abs(deltaY)
        : Math.abs(deltaX);
    const score = primary + secondary * 0.42;
    if (!best || score < best.score) best = { element, score };
  }

  if (!best) return false;
  best.element.focus({ preventScroll: true });
  best.element.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  return true;
}

function keyboardDirection(event: KeyboardEvent): Direction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowUp") return "up";
  if (event.key === "ArrowDown") return "down";
  if (event.key === "ArrowLeft") return "left";
  if (event.key === "ArrowRight") return "right";
  return null;
}

function canNavigateFromControl(
  target: HTMLElement,
  direction: Direction,
): boolean {
  if (
    target.matches(
      "[role='combobox'], [aria-autocomplete], [aria-haspopup='listbox']",
    ) ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  ) {
    return false;
  }
  if (!(target instanceof HTMLInputElement)) return true;

  const nativeArrowTypes = new Set([
    "date",
    "datetime-local",
    "month",
    "number",
    "radio",
    "range",
    "time",
    "week",
  ]);
  if (nativeArrowTypes.has(target.type)) return false;

  const textTypes = new Set([
    "email",
    "password",
    "search",
    "tel",
    "text",
    "url",
  ]);
  if (!textTypes.has(target.type)) return true;
  if (direction === "up" || direction === "down") return true;

  const start = target.selectionStart;
  const end = target.selectionEnd;
  if (start === null || end === null || start !== end) return false;
  return direction === "left" ? start === 0 : end === target.value.length;
}

function gamepadDirection(gamepad: Gamepad): Direction | null {
  if (gamepad.buttons[12]?.pressed || (gamepad.axes[1] ?? 0) < -0.55) {
    return "up";
  }
  if (gamepad.buttons[13]?.pressed || (gamepad.axes[1] ?? 0) > 0.55) {
    return "down";
  }
  if (gamepad.buttons[14]?.pressed || (gamepad.axes[0] ?? 0) < -0.55) {
    return "left";
  }
  if (gamepad.buttons[15]?.pressed || (gamepad.axes[0] ?? 0) > 0.55) {
    return "right";
  }
  return null;
}

export function InputNavigation() {
  useEffect(() => {
    let frame = 0;
    let previousPrimary = false;
    let previousSecondary = false;
    let heldDirection: Direction | null = null;
    let nextMoveAt = 0;

    const setInputMode = (mode: "keyboard" | "pointer" | "gamepad") => {
      document.documentElement.dataset.inputMode = mode;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      setInputMode("keyboard");
      const direction = keyboardDirection(event);
      if (!direction) return;
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (!target || !canNavigateFromControl(target, direction)) return;
      if (!moveFocus(direction)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onPointerDown = () => setInputMode("pointer");
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);

    const poll = (now: number) => {
      const gamepad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
      if (gamepad) {
        const direction = gamepadDirection(gamepad);
        if (direction) {
          if (direction !== heldDirection || now >= nextMoveAt) {
            setInputMode("gamepad");
            moveFocus(direction);
            nextMoveAt = direction === heldDirection ? now + 150 : now + 360;
          }
          heldDirection = direction;
        } else {
          heldDirection = null;
          nextMoveAt = 0;
        }

        const primary = Boolean(gamepad.buttons[0]?.pressed);
        if (primary && !previousPrimary) {
          setInputMode("gamepad");
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.click();
          } else {
            focusableElements()[0]?.focus();
          }
        }
        previousPrimary = primary;

        const secondary = Boolean(gamepad.buttons[1]?.pressed);
        if (secondary && !previousSecondary) {
          setInputMode("gamepad");
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
        }
        previousSecondary = secondary;
      }
      frame = window.requestAnimationFrame(poll);
    };

    frame = window.requestAnimationFrame(poll);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      delete document.documentElement.dataset.inputMode;
    };
  }, []);

  return null;
}
