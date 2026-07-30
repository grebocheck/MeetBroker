import { useI18n } from "../../lib/i18n";

export const MAX_BOOKING_IMAGE_SIZE = 12_582_912;

export function validBookingImage(file: File): boolean {
  return file.type.startsWith("image/") && file.size <= MAX_BOOKING_IMAGE_SIZE;
}

export function BookingImageField({
  preview,
  error,
  onChange,
  onInvalid,
  onRemove,
}: {
  preview: string | null;
  error?: string;
  onChange: (file: File | null) => void;
  onInvalid: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="booking-image-field">
      <div className="field-heading">
        <span>{t("booking.image")}</span>
        <small>{t("booking.imageOptional")}</small>
      </div>
      <div
        className={`booking-image-picker${preview ? " has-image" : ""}`}
        style={preview ? { backgroundImage: `url("${preview}")` } : undefined}
      >
        <div className="booking-image-picker__copy">
          <strong>
            {preview ? t("booking.imageReady") : t("booking.imageTitle")}
          </strong>
          <span>{t("booking.imageHint")}</span>
        </div>
        <div className="booking-image-picker__actions">
          <label className="button button--secondary button--slanted button--small">
            {preview ? t("booking.imageChange") : t("booking.imageChoose")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && !validBookingImage(file)) {
                  onInvalid();
                  event.target.value = "";
                  return;
                }
                onChange(file);
              }}
            />
          </label>
          {preview && (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={onRemove}
            >
              {t("booking.imageRemove")}
            </button>
          )}
        </div>
      </div>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
