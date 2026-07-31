import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { Room } from "../../types";

const ROOM_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function RoomHoursEditor({ room }: { room: Room }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [workStart, setWorkStart] = useState(room.workStart);
  const [workEnd, setWorkEnd] = useState(room.workEnd);
  const [workingDays, setWorkingDays] = useState(room.workingDays);
  const changed =
    workStart !== room.workStart ||
    workEnd !== room.workEnd ||
    workingDays.join(",") !== room.workingDays.join(",");
  const validHours =
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workStart) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(workEnd) &&
    workStart < workEnd &&
    workingDays.length > 0;
  const update = useMutation({
    mutationFn: () =>
      api<void>(`/api/admin/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workStart, workEnd, workingDays }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  return (
    <div className="room-hours-editor">
      <div className="room-hours-editor__time">
        <label className="room-hours-editor__field">
          <span>{t("admin.opening")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="09:00"
            aria-label={t("admin.openingLabel", { room: room.name })}
            value={workStart}
            onChange={(event) => {
              setWorkStart(event.target.value);
              update.reset();
            }}
          />
        </label>
        <span className="room-hours-editor__separator">—</span>
        <label className="room-hours-editor__field">
          <span>{t("admin.closing")}</span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="19:00"
            aria-label={t("admin.closingLabel", { room: room.name })}
            value={workEnd}
            onChange={(event) => {
              setWorkEnd(event.target.value);
              update.reset();
            }}
          />
        </label>
      </div>
      <WorkingDayPicker
        days={workingDays}
        onChange={(days) => {
          setWorkingDays(days);
          update.reset();
        }}
      />
      <Button
        size="small"
        disabled={!changed || !validHours || update.isPending}
        onClick={() => update.mutate()}
      >
        {update.isPending ? "…" : t("save")}
      </Button>
      {changed && !validHours && (
        <small className="field-error">{t("admin.invalidAvailability")}</small>
      )}
      {update.error && (
        <small className="field-error">
          {errorMessage(update.error, t, "admin.updateScheduleError")}
        </small>
      )}
    </div>
  );
}

export function WorkingDayPicker({
  days,
  onChange,
}: {
  days: number[];
  onChange: (days: number[]) => void;
}) {
  const { t } = useI18n();
  const labels = [
    t("weekday.mon"),
    t("weekday.tue"),
    t("weekday.wed"),
    t("weekday.thu"),
    t("weekday.fri"),
    t("weekday.sat"),
    t("weekday.sun"),
  ];

  return (
    <fieldset className="working-day-picker">
      <legend>{t("admin.workingDays")}</legend>
      <div>
        {ROOM_WEEKDAYS.map((day, index) => {
          const selected = days.includes(day);
          return (
            <button
              type="button"
              className={selected ? "is-active" : ""}
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? days.filter((value) => value !== day)
                    : [...days, day].sort((a, b) => a - b),
                )
              }
              key={day}
            >
              {labels[index]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
