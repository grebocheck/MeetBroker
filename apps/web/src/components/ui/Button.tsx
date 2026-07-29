import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "regular" | "small";
type ButtonShape = "slanted" | "soft";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  wide?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "regular",
      shape = "slanted",
      wide = false,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    const classes = [
      "button",
      `button--${variant}`,
      size === "small" ? "button--small" : "",
      shape === "slanted" ? "button--slanted" : "",
      wide ? "button--wide" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} type={type} className={classes} {...props}>
        <span>{children}</span>
      </button>
    );
  },
);
