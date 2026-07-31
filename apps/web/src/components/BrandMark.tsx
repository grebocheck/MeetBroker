export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <path
          className="brand-mark__field"
          d="M8 4h28l-4 32H4L8 4Z"
          fill="currentColor"
          opacity=".16"
        />
        <path
          d="M8 29 13.5 10 20 23l8-13 4 19"
          stroke="currentColor"
          strokeLinecap="square"
          strokeLinejoin="round"
          strokeWidth="3.4"
        />
        <path
          className="brand-mark__current"
          d="M6 32h28"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          className="brand-mark__signal"
          cx="31"
          cy="8"
          r="3"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
