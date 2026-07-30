import { useI18n } from "../../lib/i18n";
import type { Recurrence } from "./booking-dialog.model";

export interface RecurrenceValues {
  recurrence: Recurrence;
  recurrenceInterval: number;
  recurrenceUntil: string;
  weekdays: number[];
}

export function RecurrenceFields({
  values,
  minDate,
  error,
  onChange,
}: {
  values: RecurrenceValues;
  minDate: string;
  error?: string;
  onChange: (change: Partial<RecurrenceValues>) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset className="segmented-field recurrence-field">
      <div className="recurrence-field__heading">
        <span>{t("booking.recurrence")}</span>
        <small>{t("booking.recurrenceHint")}</small>
      </div>
      <div className="segmented">
        {(
          [
            ["NONE", t("booking.noRecurrence")],
            ["DAILY", t("booking.daily")],
            ["WEEKLY", t("booking.weekly")],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            className={values.recurrence === value ? "is-active" : ""}
            onClick={() => onChange({ recurrence: value })}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      {values.recurrence !== "NONE" && (
        <div className="recurrence-settings">
          <label className="field">
            <span>
              {values.recurrence === "DAILY"
                ? t("booking.dayInterval")
                : t("booking.weekInterval")}
            </span>
            <input
              type="number"
              min={1}
              max={30}
              value={values.recurrenceInterval}
              onChange={(event) =>
                onChange({
                  recurrenceInterval: Math.max(
                    1,
                    Math.min(30, Number(event.target.value)),
                  ),
                })
              }
            />
          </label>
          <label className="field">
            <span>{t("booking.repeatUntil")}</span>
            <input
              type="date"
              value={values.recurrenceUntil}
              min={minDate}
              onChange={(event) =>
                onChange({ recurrenceUntil: event.target.value })
              }
            />
          </label>
          {values.recurrence === "WEEKLY" && (
            <div className="weekday-picker recurrence-weekdays">
              {(
                [
                  [1, t("weekday.1")],
                  [2, t("weekday.2")],
                  [3, t("weekday.3")],
                  [4, t("weekday.4")],
                  [5, t("weekday.5")],
                  [6, t("weekday.6")],
                  [0, t("weekday.0")],
                ] as const
              ).map(([day, label]) => (
                <button
                  type="button"
                  className={values.weekdays.includes(day) ? "is-active" : ""}
                  onClick={() =>
                    onChange({
                      weekdays: values.weekdays.includes(day)
                        ? values.weekdays.filter((item) => item !== day)
                        : [...values.weekdays, day],
                    })
                  }
                  key={day}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <small>{t("booking.atomicSeries")}</small>
        </div>
      )}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </fieldset>
  );
}
