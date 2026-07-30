import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { Button } from "./ui/Button";
import { ModalLayer } from "./ui/ModalLayer";

export interface TelegramConnectInfo {
  appUrl: string;
  webUrl: string;
  botUsername: string;
  expiresInSeconds: number;
}

export function TelegramConnectDialog({
  connection,
  onClose,
}: {
  connection: TelegramConnectInfo;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  return (
    <ModalLayer
      className="modal-backdrop"
      role="presentation"
      onDismiss={onClose}
      onMouseDown={onClose}
    >
      <section
        className="modal telegram-connect-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-connect-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <div>
            <span className="eyebrow">{t("telegramConnect.eyebrow")}</span>
            <h2 id="telegram-connect-title">{t("telegramConnect.title")}</h2>
            <p>{t("telegramConnect.subtitle")}</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <div className="telegram-connect-dialog__bot">
          <span aria-hidden="true">✦</span>
          <div>
            <strong>@{connection.botUsername}</strong>
            <small>{t("telegramConnect.officialBot")}</small>
          </div>
        </div>

        <ol className="telegram-connect-steps">
          <li>{t("telegramConnect.stepOpen")}</li>
          <li>{t("telegramConnect.stepStart")}</li>
          <li>{t("telegramConnect.stepReturn")}</li>
        </ol>

        <div className="subtle-box telegram-connect-dialog__status">
          <span className="telegram-connect-dialog__pulse" aria-hidden="true" />
          <span>{t("telegramConnect.waiting")}</span>
        </div>

        <div className="modal__actions telegram-connect-dialog__actions">
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = connection.appUrl;
            }}
          >
            {t("telegramConnect.openApp")}
          </Button>
          <Button
            onClick={() =>
              window.open(connection.webUrl, "_blank", "noopener,noreferrer")
            }
          >
            {t("telegramConnect.openFallback")}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(connection.webUrl);
              setCopied(true);
            }}
          >
            {copied
              ? t("telegramConnect.copied")
              : t("telegramConnect.copyLink")}
          </Button>
        </div>
        <small className="telegram-connect-dialog__hint">
          {t("telegramConnect.expiry")}
        </small>
      </section>
    </ModalLayer>
  );
}
