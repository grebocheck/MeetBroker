import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/ui/Button";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";

export function SecuritySection() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api<void>("/api/users/me/password-change", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      }),
    onSuccess: () =>
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }),
  });

  return (
    <div className="security-section">
      <div>
        <h3>{t("profile.passwordTitle")}</h3>
        <p>{t("profile.passwordHint")}</p>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          changePassword.mutate();
        }}
      >
        <label className="field">
          <span>{t("profile.currentPassword")}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) => {
              changePassword.reset();
              setForm({ ...form, currentPassword: event.target.value });
            }}
            required
          />
        </label>
        <label className="field">
          <span>{t("profile.newPassword")}</span>
          <input
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => {
              changePassword.reset();
              setForm({ ...form, newPassword: event.target.value });
            }}
            required
          />
        </label>
        <label className="field">
          <span>{t("profile.repeatPassword")}</span>
          <input
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={(event) => {
              changePassword.reset();
              setForm({ ...form, confirmPassword: event.target.value });
            }}
            required
          />
          {form.confirmPassword &&
            form.newPassword !== form.confirmPassword && (
              <small className="field-error">
                {t("profile.passwordMismatch")}
              </small>
            )}
        </label>
        {changePassword.error && (
          <div className="form-error" role="alert">
            {errorMessage(changePassword.error, t, "profile.passwordError")}
          </div>
        )}
        {changePassword.isSuccess && (
          <div className="form-success" role="status">
            {t("profile.passwordSuccess")}
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={
            changePassword.isPending ||
            form.newPassword.length < 8 ||
            form.newPassword !== form.confirmPassword
          }
        >
          {changePassword.isPending
            ? t("profile.changing")
            : t("profile.changePassword")}
        </Button>
      </form>
    </div>
  );
}
