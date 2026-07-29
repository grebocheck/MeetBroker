import { useMemo, useState } from "react";
import type { Person } from "../types";
import { Avatar } from "./Avatar";

export function ParticipantPicker({
  people,
  selectedIds,
  maxSelected,
  onChange
}: {
  people: Person[];
  selectedIds: string[];
  maxSelected: number;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("uk-UA");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedPeople = people.filter((person) => selectedSet.has(person.id));
  const filteredPeople = people.filter((person) =>
    person.name.toLocaleLowerCase("uk-UA").includes(normalizedQuery)
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
        <div className="participant-picker__selected" aria-label="Вибрані учасники">
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
                aria-label={`Видалити ${person.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <label className="participant-search">
        <span className="participant-search__icon" aria-hidden="true" />
        <span className="sr-only">Пошук колег</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Знайти колегу за ім’ям"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Очистити пошук"
          >
            ×
          </button>
        )}
      </label>

      <div className="people-picker" role="listbox" aria-multiselectable="true">
        {filteredPeople.length === 0 ? (
          <div className="people-picker__empty">
            За запитом «{query.trim()}» нікого не знайдено
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
          ? "Досягнуто місткості кімнати"
          : `Доступно місць: ${Math.max(0, maxSelected - selectedIds.length)}`}
      </small>
    </div>
  );
}
