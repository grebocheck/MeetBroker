import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import { useI18n } from "../lib/i18n";
import type { User } from "../types";
import { Button } from "../components/ui/Button";

export function PendingApprovalPage({ user }: { user: User }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api<void>("/api/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      navigate("/login", true);
    }
  });
  return (
    <div className="status-page">
      <div className="status-card">
        <span className="status-icon">✓</span>
        <span className="eyebrow">{t("auth.corporateAccess")}</span>
        <h1>
          {user.emailVerified
            ? t("approval.title")
            : t("approval.verifyTitle")}
        </h1>
        <p>
          {user.emailVerified
            ? t("approval.body")
            : t("approval.verifyBody")}
        </p>
        <div className="status-card__meta">
          <span>{user.name}</span>
          <strong>{user.email}</strong>
        </div>
        <div className="button-row">
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["me"] })}
          >
            {t("approval.refresh")}
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            {t("signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
