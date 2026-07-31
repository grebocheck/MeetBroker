import { useMemo, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { Person } from "../types";
import { Avatar } from "./Avatar";

export function ParticipantPicker({
  people,
  selectedIds,
  maxSelected,
  onChange,
}: {
  people: Person[];
  selectedIds: string[];
  maxSelected: number;
  onChange: (ids: string[]) => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPeople = people.filter((person) => selectedSet.has(person.id));
  const filteredPeople = people.filter((person) =>
    person.name.toLocaleLowerCase(locale).includes(normalizedQuery),
  );
  const limitReached = selectedIds.length >= maxSelected;

  const toggle = (personId: string) => {
    if (selectedSet.has(personId)) {
      onChange(selectedIds.filter((id) => id !== personId));
      return;
    }
    if (!limitReached) onChange([...selectedIds, personId]);
  };

  return (
    <div className="participant-picker">
      {selectedPeople.length > 0 && (
        <div
          className="participant-picker__selected"
          aria-label={t("participants.selected")}
        >
          {selectedPeople.map((person) => (
            <span className="participant-chip" key={person.id}>
              <Avatar
                name={person.name}
                preset={person.avatarPreset}
                url={person.avatarUrl}
                size="sm"
              />
              <span>{person.name}</span>
              <button
                type="button"
                onClick={() => toggle(person.id)}
                aria-label={t("participants.remove", { name: person.name })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="participant-search">
        <span className="participant-search__icon" aria-hidden="true" />
        <span className="sr-only">{t("participants.search")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("participants.searchPlaceholder")}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("participants.clearSearch")}
          >
            ×
          </button>
        )}
      </label>

      <div className="people-picker" role="listbox" aria-multiselectable="true">
        {filteredPeople.length === 0 ? (
          <div className="people-picker__empty">
            {t("participants.notFound", { query: query.trim() })}
          </div>
        ) : (
          filteredPeople.map((person) => {
            const checked = selectedSet.has(person.id);
            const disabled = !checked && limitReached;
            return (
              <button
                type="button"
                role="option"
                aria-selected={checked}
                className={`person-option${checked ? " is-selected" : ""}`}
                key={person.id}
                disabled={disabled}
                onClick={() => toggle(person.id)}
              >
                <Avatar
                  name={person.name}
                  preset={person.avatarPreset}
                  url={person.avatarUrl}
                  size="sm"
                />
                <span>{person.name}</span>
                <span className="person-option__state" aria-hidden="true">
                  {checked ? "✓" : "+"}
                </span>
              </button>
            );
          })
        )}
      </div>
      <small className="participant-picker__hint">
        {limitReached
          ? t("participants.capacityReached")
          : t("participants.seatsAvailable", {
              count: Math.max(0, maxSelected - selectedIds.length),
            })}
      </small>
    </div>
  );
}
