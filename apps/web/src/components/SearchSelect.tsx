import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { useI18n } from "../lib/i18n";

export interface SearchSelectOption {
  value: string;
  label: string;
}

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText
}: {
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("select.placeholder");
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("select.searchPlaceholder");
  const resolvedEmptyText = emptyText ?? t("select.empty");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return options;
    return options.filter((option) =>
      `${option.label} ${option.value}`.toLocaleLowerCase().includes(needle)
    );
  }, [options, query]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const choose = (option: SearchSelectOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) =>
        Math.max(0, Math.min(filtered.length - 1, current + direction))
      );
      return;
    }
    if (event.key === "Enter" && open && filtered[highlighted]) {
      event.preventDefault();
      choose(filtered[highlighted]);
    }
  };

  return (
    <div className="search-select" ref={rootRef}>
      <div className={`search-select__control${open ? " is-open" : ""}`}>
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={
            open && filtered[highlighted]
              ? `${listId}-${highlighted}`
              : undefined
          }
          value={open ? query : selected?.label ?? value}
          placeholder={open ? resolvedSearchPlaceholder : resolvedPlaceholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setOpen(true);
            setQuery(event.target.value);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? t("select.close") : t("select.open")}
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {open && (
        <div className="search-select__menu" id={listId} role="listbox">
          {filtered.length ? (
            filtered.map((option, index) => (
              <button
                type="button"
                id={`${listId}-${index}`}
                className={`${option.value === value ? "is-selected" : ""}${
                  index === highlighted ? " is-highlighted" : ""
                }`}
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                {option.value === value && <strong>{t("select.selected")}</strong>}
              </button>
            ))
          ) : (
            <span className="search-select__empty">{resolvedEmptyText}</span>
          )}
        </div>
      )}
    </div>
  );
}
