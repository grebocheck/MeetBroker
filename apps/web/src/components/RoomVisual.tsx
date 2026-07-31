import type { Room } from "../types";

export function RoomVisual({
  room,
  size = "hero",
}: {
  room: Pick<Room, "name" | "imageUrl">;
  size?: "hero" | "compact";
}) {
  return (
    <div
      className={`room-visual room-visual--${size}${
        room.imageUrl ? " has-image" : ""
      }`}
      aria-hidden="true"
    >
      {room.imageUrl ? (
        <img src={room.imageUrl} alt="" />
      ) : (
        <>
          <span className="room-visual__monogram">
            {room.name.trim().slice(0, 1).toLocaleUpperCase()}
          </span>
          <span className="room-visual__signal" />
        </>
      )}
    </div>
  );
}
