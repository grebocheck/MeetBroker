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

type NavigationRect = Pick<
  DOMRect,
  "bottom" | "height" | "left" | "right" | "top" | "width"
>;

function navigationScope(current: HTMLElement | null): HTMLElement {
  const modal = document.querySelector<HTMLElement>("[aria-modal='true']");
  const composite = current?.closest<HTMLElement>(
    "[role='menu'], [role='listbox'], [role='tablist']",
  );
  if (composite && (!modal || modal.contains(composite))) return composite;
  if (modal) return modal;

  return document.body;
}

function focusableElements(current: HTMLElement | null = null): HTMLElement[] {
  const scope = navigationScope(current);
  return Array.from(
    scope.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => {
    const closedDetails = element.closest("details:not([open])");
    if (closedDetails && element.tagName !== "SUMMARY") return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.pointerEvents !== "none" &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]")
    );
  });
}

function intervalGap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number {
  if (firstEnd < secondStart) return secondStart - firstEnd;
  if (secondEnd < firstStart) return firstStart - secondEnd;
  return 0;
}

export function spatialNavigationScore(
  origin: NavigationRect,
  candidate: NavigationRect,
  direction: Direction,
): number | null {
  const originX = origin.left + origin.width / 2;
  const originY = origin.top + origin.height / 2;
  const candidateX = candidate.left + candidate.width / 2;
  const candidateY = candidate.top + candidate.height / 2;
  const horizontal = direction === "left" || direction === "right";
  const primaryDelta = horizontal
    ? direction === "left"
      ? originX - candidateX
      : candidateX - originX
    : direction === "up"
      ? originY - candidateY
      : candidateY - originY;
  if (primaryDelta <= 4) return null;

  const primaryGap = horizontal
    ? direction === "left"
      ? Math.max(0, origin.left - candidate.right)
      : Math.max(0, candidate.left - origin.right)
    : direction === "up"
      ? Math.max(0, origin.top - candidate.bottom)
      : Math.max(0, candidate.top - origin.bottom);
  const secondaryGap = horizontal
    ? intervalGap(origin.top, origin.bottom, candidate.top, candidate.bottom)
    : intervalGap(origin.left, origin.right, candidate.left, candidate.right);
  const secondaryCenterDistance = horizontal
    ? Math.abs(candidateY - originY)
    : Math.abs(candidateX - originX);

  // Keep movement in the current visual row/column whenever possible.
  // A non-overlapping lane is still reachable, but loses to aligned controls.
  const lanePenalty = secondaryGap > 0 ? 1_000 : 0;
  return (
    lanePenalty +
    primaryGap +
    primaryDelta * 0.2 +
    secondaryGap * 4 +
    secondaryCenterDistance * 0.08
  );
}

export function linearNavigationStep(
  role: string | null,
  direction: Direction,
): -1 | 0 | 1 {
  if (role === "tablist") {
    if (direction === "left") return -1;
    if (direction === "right") return 1;
    return 0;
  }
  if (role === "menu" || role === "listbox") {
    if (direction === "up") return -1;
    if (direction === "down") return 1;
  }
  return 0;
}

function moveFocus(direction: Direction): boolean {
  const current =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const candidates = focusableElements(current);
  if (!candidates.length) return false;
  if (!current || !candidates.includes(current)) {
    candidates[0]?.focus();
    candidates[0]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  if (
    direction === "down" &&
    current instanceof HTMLElement &&
    current.tagName === "SUMMARY"
  ) {
    const details = current.closest<HTMLDetailsElement>("details");
    if (details && !details.open) details.open = true;
    const firstMenuItem = details
      ?.querySelector<HTMLElement>("[role='menu']")
      ?.querySelector<HTMLElement>(focusableSelector);
    if (firstMenuItem) {
      firstMenuItem.focus({ preventScroll: true });
      firstMenuItem.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    }
  }

  const currentDetails =
    current.tagName === "SUMMARY"
      ? current.closest<HTMLDetailsElement>("details")
      : null;
  const spatialCandidates = currentDetails
    ? candidates.filter(
        (candidate) =>
          candidate === current || !currentDetails.contains(candidate),
      )
    : candidates;

  const composite = current.closest<HTMLElement>(
    "[role='menu'], [role='listbox'], [role='tablist']",
  );
  const linearDirection = linearNavigationStep(
    composite?.getAttribute("role") ?? null,
    direction,
  );
  if (linearDirection) {
    const currentIndex = candidates.indexOf(current);
    const nextIndex =
      (currentIndex + linearDirection + candidates.length) % candidates.length;
    const next = candidates[nextIndex];
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  const origin = current.getBoundingClientRect();
  let best: { element: HTMLElement; score: number } | undefined;

  for (const element of spatialCandidates) {
    if (element === current) continue;
    const rect = element.getBoundingClientRect();
    const score = spatialNavigationScore(origin, rect, direction);
    if (score === null) continue;
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
      if (event.defaultPrevented) return;
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (event.key === "Escape" || event.key === "ArrowLeft") {
        const details = active
          ?.closest<HTMLElement>("[role='menu']")
          ?.closest<HTMLDetailsElement>("details[open]");
        if (details) {
          details.open = false;
          details
            .querySelector<HTMLElement>("summary")
            ?.focus({ preventScroll: true });
          event.preventDefault();
          return;
        }
      }
      const direction = keyboardDirection(event);
      if (!direction) return;
      const target =
        event.target instanceof HTMLElement ? event.target : undefined;
      if (!target || !canNavigateFromControl(target, direction)) return;
      if (!moveFocus(direction)) return;
      event.preventDefault();
    };
    const onPointerDown = () => setInputMode("pointer");
    window.addEventListener("keydown", onKeyDown);
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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
      delete document.documentElement.dataset.inputMode;
    };
  }, []);

  return null;
}
