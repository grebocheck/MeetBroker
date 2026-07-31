import type { CSSProperties } from "react";

function presetPosition(preset: string): CSSProperties {
  const index = Math.max(
    0,
    Math.min(11, Number(preset.replace("avatar-", "")) - 1),
  );
  const column = index % 4;
  const row = Math.floor(index / 4);
  return {
    backgroundImage: "url('/avatars/editorial-avatar-sheet.png')",
    backgroundSize: "400% 300%",
    backgroundPosition: `${column * 33.333}% ${row * 50}%`,
  };
}

export function Avatar({
  name,
  preset,
  url,
  size = "md",
}: {
  name: string;
  preset: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={
        url
          ? { backgroundImage: `url(${JSON.stringify(url).slice(1, -1)})` }
          : presetPosition(preset)
      }
      role="img"
      aria-label={name}
    />
  );
}
