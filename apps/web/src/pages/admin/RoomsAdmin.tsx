import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RoomVisual } from "../../components/RoomVisual";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { Room } from "../../types";
import { formatRoomBlockRule, type AdminRoomBlock } from "./admin-formatters";
import { RoomHoursEditor, WorkingDayPicker } from "./RoomAvailabilityFields";

export function RoomsAdmin() {
  const { dateLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [editor, setEditor] = useState<"room" | "block" | null>(null);
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => api<{ rooms: Room[] }>("/api/rooms"),
  });
  const blocks = useQuery({
    queryKey: ["admin-room-blocks"],
    queryFn: () => api<{ blocks: AdminRoomBlock[] }>("/api/admin/room-blocks"),
  });
  const [roomForm, setRoomForm] = useState({
    name: "",
    floor: 1,
    capacity: 6,
    workStart: "09:00",
    workEnd: "19:00",
    workingDays: [1, 2, 3, 4, 5] as number[],
  });
  const [roomImage, setRoomImage] = useState<File | null>(null);
  const [blockForm, setBlockForm] = useState({
    roomId: "",
    title: t("admin.maintenance"),
    privateNote: "",
    startsAt: "",
    endsAt: "",
    recurrence: "NONE" as "NONE" | "DAILY" | "WEEKLY",
    recurrenceInterval: 1,
    weekdays: [] as number[],
    recurrenceUntil: "",
  });
  const createRoom = useMutation({
    mutationFn: async () => {
      const created = await api<{ id: string }>("/api/admin/rooms", {
        method: "POST",
        body: JSON.stringify(roomForm),
      });
      if (roomImage) {
        const form = new FormData();
        form.set("image", roomImage);
        await api<{ imageUrl: string }>(
          `/api/admin/rooms/${created.id}/image`,
          { method: "POST", body: form },
        );
      }
      return created;
    },
    onSuccess: (created) => {
      setRoomForm({
        name: "",
        floor: 1,
        capacity: 6,
        workStart: "09:00",
        workEnd: "19:00",
        workingDays: [1, 2, 3, 4, 5],
      });
      setRoomImage(null);
      setSelectedRoomId(created.id);
      setEditor(null);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });
  const uploadRoomImage = useMutation({
    mutationFn: ({ roomId, file }: { roomId: string; file: File }) => {
      const form = new FormData();
      form.set("image", file);
      return api<{ imageUrl: string }>(`/api/admin/rooms/${roomId}/image`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
  const removeRoomImage = useMutation({
    mutationFn: (roomId: string) =>
      api<void>(`/api/admin/rooms/${roomId}/image`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
  const createBlock = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/admin/room-blocks", {
        method: "POST",
        body: JSON.stringify({
          ...blockForm,
          startsAt: new Date(blockForm.startsAt).toISOString(),
          endsAt: new Date(blockForm.endsAt).toISOString(),
          recurrenceUntil:
            blockForm.recurrence === "NONE"
              ? undefined
              : blockForm.recurrenceUntil,
          weekdays:
            blockForm.recurrence === "WEEKLY" ? blockForm.weekdays : undefined,
        }),
      }),
    onSuccess: () => {
      setBlockForm({
        ...blockForm,
        startsAt: "",
        endsAt: "",
        recurrence: "NONE",
        recurrenceInterval: 1,
        weekdays: [],
        recurrenceUntil: "",
      });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["admin-room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      setEditor(null);
    },
  });
  const cancelBlock = useMutation({
    mutationFn: (block: AdminRoomBlock) =>
      api<void>(
        `/api/admin/room-blocks/${block.id}?scope=${
          block.kind === "SERIES" ? "series" : "once"
        }`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["admin-room-blocks"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const roomList = rooms.data?.rooms ?? [];
  const selectedRoom =
    roomList.find((room) => room.id === selectedRoomId) ?? roomList[0] ?? null;
  const selectedBlocks =
    blocks.data?.blocks.filter((block) => block.roomId === selectedRoom?.id) ??
    [];

  return (
    <div className="room-management">
      <div className="room-management__bar">
        <div>
          <span className="eyebrow">{t("admin.companySpaces")}</span>
          <h2>{t("admin.meetingRooms")}</h2>
          <p>{t("admin.roomsSummary", { count: roomList.length })}</p>
        </div>
        <Button
          size="small"
          onClick={() => setEditor(editor === "room" ? null : "room")}
        >
          {editor === "room"
            ? t("admin.closeForm")
            : t("admin.addRoomWithPlus")}
        </Button>
      </div>

      <div className="room-management__workspace">
        <aside
          className="admin-card room-catalog"
          aria-label={t("admin.meetingRooms")}
        >
          <div className="room-catalog__heading">
            <strong>{t("admin.allRooms")}</strong>
            <span>{roomList.length}</span>
          </div>
          <div className="room-catalog__list">
            {roomList.map((room) => {
              const roomBlockCount =
                blocks.data?.blocks.filter((block) => block.roomId === room.id)
                  .length ?? 0;
              return (
                <button
                  type="button"
                  className={`room-catalog__item ${
                    selectedRoom?.id === room.id ? "is-active" : ""
                  }`}
                  key={room.id}
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setBlockForm({ ...blockForm, roomId: room.id });
                    setEditor(null);
                  }}
                >
                  <RoomVisual room={room} size="compact" />
                  <span className="room-catalog__copy">
                    <strong>{room.name}</strong>
                    <small>
                      {t("admin.roomMeta", {
                        floor: room.floor,
                        capacity: room.capacity,
                      })}
                    </small>
                  </span>
                  <span className="room-catalog__meta">
                    {roomBlockCount > 0 && <em>{roomBlockCount}</em>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="admin-card room-workspace">
          {editor === "room" ? (
            <form
              className="form-stack room-workspace__form"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                createRoom.mutate();
              }}
            >
              <div className="room-workspace__form-heading">
                <div>
                  <span className="eyebrow">{t("admin.newSpace")}</span>
                  <h2>{t("admin.addRoom")}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => setEditor(null)}
                >
                  {t("cancel")}
                </Button>
              </div>
              <label className="field">
                <span>{t("admin.name")}</span>
                <input
                  value={roomForm.name}
                  onChange={(event) =>
                    setRoomForm({ ...roomForm, name: event.target.value })
                  }
                  required
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>{t("admin.floor")}</span>
                  <input
                    type="number"
                    min={0}
                    value={roomForm.floor}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        floor: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>{t("admin.capacity")}</span>
                  <input
                    type="number"
                    min={1}
                    value={roomForm.capacity}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        capacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <WorkingDayPicker
                days={roomForm.workingDays}
                onChange={(workingDays) =>
                  setRoomForm({ ...roomForm, workingDays })
                }
              />
              <div className="form-grid">
                <label className="field">
                  <span>{t("admin.opensAt")}</span>
                  <input
                    type="time"
                    step={1800}
                    value={roomForm.workStart}
                    onChange={(event) =>
                      setRoomForm({
                        ...roomForm,
                        workStart: event.target.value,
                      })
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>{t("admin.closesAt")}</span>
                  <input
                    type="time"
                    step={1800}
                    value={roomForm.workEnd}
                    onChange={(event) =>
                      setRoomForm({ ...roomForm, workEnd: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <label className="upload-box">
                <span>
                  <strong>{t("admin.roomPhoto")}</strong>
                  <small>{t("admin.roomPhotoHint")}</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setRoomImage(event.target.files?.[0] ?? null)
                  }
                />
                <em>{roomImage ? roomImage.name : t("admin.chooseFile")}</em>
              </label>
              {createRoom.error && (
                <div className="form-error">
                  {errorMessage(createRoom.error, t, "admin.addRoomError")}
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  createRoom.isPending || roomForm.workingDays.length === 0
                }
              >
                {createRoom.isPending ? t("admin.adding") : t("admin.addRoom")}
              </Button>
            </form>
          ) : selectedRoom ? (
            <>
              <header className="room-workspace__hero">
                <RoomVisual room={selectedRoom} />
                <div>
                  <span className="eyebrow">{t("admin.selectedRoom")}</span>
                  <h2>{selectedRoom.name}</h2>
                  <p>
                    {t("admin.roomMeta", {
                      floor: selectedRoom.floor,
                      capacity: selectedRoom.capacity,
                    })}
                  </p>
                </div>
                <div className="room-image-actions">
                  <label className="button button--secondary button--slanted button--small room-image-action">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file)
                          uploadRoomImage.mutate({
                            roomId: selectedRoom.id,
                            file,
                          });
                        event.target.value = "";
                      }}
                    />
                    <span>
                      {uploadRoomImage.isPending
                        ? t("admin.processing")
                        : selectedRoom.imageUrl
                          ? t("admin.replacePhoto")
                          : t("admin.addPhoto")}
                    </span>
                  </label>
                  {selectedRoom.imageUrl && (
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={removeRoomImage.isPending}
                      onClick={() => removeRoomImage.mutate(selectedRoom.id)}
                    >
                      {t("admin.remove")}
                    </Button>
                  )}
                </div>
              </header>

              {(uploadRoomImage.error || removeRoomImage.error) && (
                <div className="form-error">
                  {errorMessage(
                    uploadRoomImage.error ?? removeRoomImage.error,
                    t,
                    "admin.photoError",
                  )}
                </div>
              )}

              <div className="room-workspace__settings">
                <div>
                  <span className="eyebrow">{t("admin.availability")}</span>
                  <h3>{t("admin.workingHours")}</h3>
                  <p>{t("admin.workingHoursHint")}</p>
                </div>
                <RoomHoursEditor room={selectedRoom} />
              </div>

              <div className="room-workspace__blocks">
                <div className="room-workspace__section-heading">
                  <div>
                    <span className="eyebrow">
                      {t("admin.scheduleExceptions")}
                    </span>
                    <h3>{t("admin.unavailability")}</h3>
                  </div>
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                      setBlockForm({
                        ...blockForm,
                        roomId: selectedRoom.id,
                      });
                      setEditor("block");
                    }}
                  >
                    {t("admin.addExceptionWithPlus")}
                  </Button>
                </div>
                {blocks.isLoading ? (
                  <div className="subtle-box">{t("admin.loadingRules")}</div>
                ) : selectedBlocks.length === 0 ? (
                  <div className="empty-inline">
                    {t("admin.noRoomExceptions")}
                  </div>
                ) : (
                  <div className="room-block-list">
                    {selectedBlocks.map((block) => (
                      <article className="room-block-row" key={block.id}>
                        <div>
                          <span
                            className={`status-badge ${
                              block.kind === "SERIES"
                                ? "status-badge--warning"
                                : ""
                            }`}
                          >
                            {block.kind === "SERIES"
                              ? t("admin.series")
                              : t("admin.once")}
                          </span>
                          <strong>{block.title}</strong>
                          <small>
                            {formatRoomBlockRule(block, dateLocale, t)}
                          </small>
                        </div>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={
                            cancelBlock.isPending &&
                            cancelBlock.variables?.id === block.id
                          }
                          onClick={() => cancelBlock.mutate(block)}
                        >
                          {block.kind === "SERIES"
                            ? t("admin.cancelSeries")
                            : t("admin.remove")}
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {editor === "block" && (
                <form
                  className="form-stack room-block-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createBlock.mutate();
                  }}
                >
                  <div className="room-workspace__form-heading">
                    <div>
                      <span className="eyebrow">{t("admin.newException")}</span>
                      <h3>{t("admin.limitAvailability")}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setEditor(null)}
                    >
                      {t("close")}
                    </Button>
                  </div>
                  <p className="room-block-editor__room">
                    {t("room")}: <strong>{selectedRoom.name}</strong>
                  </p>
                  <label className="field">
                    <span>{t("admin.publicTitle")}</span>
                    <input
                      value={blockForm.title}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          title: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("admin.privateNote")}</span>
                    <textarea
                      value={blockForm.privateNote}
                      onChange={(event) =>
                        setBlockForm({
                          ...blockForm,
                          privateNote: event.target.value,
                        })
                      }
                      maxLength={300}
                      placeholder={t("admin.privateNotePlaceholder")}
                    />
                  </label>
                  <div className="form-grid">
                    <label className="field">
                      <span>{t("admin.start")}</span>
                      <input
                        type="datetime-local"
                        value={blockForm.startsAt}
                        onChange={(event) =>
                          setBlockForm({
                            ...blockForm,
                            startsAt: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                    <label className="field">
                      <span>{t("admin.end")}</span>
                      <input
                        type="datetime-local"
                        value={blockForm.endsAt}
                        onChange={(event) =>
                          setBlockForm({
                            ...blockForm,
                            endsAt: event.target.value,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <fieldset className="segmented-field">
                    <legend>{t("admin.recurrence")}</legend>
                    <div className="segmented recurrence-segmented">
                      {[
                        ["NONE", t("admin.noRecurrence")],
                        ["DAILY", t("admin.everyNDays")],
                        ["WEEKLY", t("admin.byWeekdays")],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          className={
                            blockForm.recurrence === value ? "is-active" : ""
                          }
                          onClick={() =>
                            setBlockForm({
                              ...blockForm,
                              recurrence: value as "NONE" | "DAILY" | "WEEKLY",
                              weekdays:
                                value === "WEEKLY" ? blockForm.weekdays : [],
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {blockForm.recurrence !== "NONE" && (
                    <>
                      <div className="form-grid">
                        <label className="field">
                          <span>
                            {t("admin.intervalIn")}{" "}
                            {blockForm.recurrence === "DAILY"
                              ? t("admin.days")
                              : t("admin.weeks")}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={blockForm.recurrenceInterval}
                            onChange={(event) =>
                              setBlockForm({
                                ...blockForm,
                                recurrenceInterval: Number(event.target.value),
                              })
                            }
                            required
                          />
                        </label>
                        <label className="field">
                          <span>{t("admin.repeatUntil")}</span>
                          <input
                            type="date"
                            value={blockForm.recurrenceUntil}
                            onChange={(event) =>
                              setBlockForm({
                                ...blockForm,
                                recurrenceUntil: event.target.value,
                              })
                            }
                            required
                          />
                        </label>
                      </div>
                      {blockForm.recurrence === "WEEKLY" && (
                        <fieldset className="weekday-picker">
                          <legend>{t("admin.weekdays")}</legend>
                          {[
                            [1, t("weekday.mon")],
                            [2, t("weekday.tue")],
                            [3, t("weekday.wed")],
                            [4, t("weekday.thu")],
                            [5, t("weekday.fri")],
                            [6, t("weekday.sat")],
                            [0, t("weekday.sun")],
                          ].map(([value, label]) => {
                            const day = Number(value);
                            const checked = blockForm.weekdays.includes(day);
                            return (
                              <button
                                type="button"
                                key={value}
                                className={checked ? "is-active" : ""}
                                aria-pressed={checked}
                                onClick={() =>
                                  setBlockForm({
                                    ...blockForm,
                                    weekdays: checked
                                      ? blockForm.weekdays.filter(
                                          (candidate) => candidate !== day,
                                        )
                                      : [...blockForm.weekdays, day],
                                  })
                                }
                              >
                                {label}
                              </button>
                            );
                          })}
                        </fieldset>
                      )}
                    </>
                  )}
                  {createBlock.error && (
                    <div className="form-error">
                      {errorMessage(
                        createBlock.error,
                        t,
                        "admin.createBlockError",
                      )}
                    </div>
                  )}
                  <Button
                    type="submit"
                    disabled={
                      createBlock.isPending ||
                      (blockForm.recurrence === "WEEKLY" &&
                        blockForm.weekdays.length === 0)
                    }
                  >
                    {createBlock.isPending
                      ? t("admin.saving")
                      : blockForm.recurrence === "NONE"
                        ? t("admin.addException")
                        : t("admin.createSeries")}
                  </Button>
                </form>
              )}
            </>
          ) : (
            <div className="empty-inline">{t("admin.addFirstRoom")}</div>
          )}
        </section>
      </div>
    </div>
  );
}
