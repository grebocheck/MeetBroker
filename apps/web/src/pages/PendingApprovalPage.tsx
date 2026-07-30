import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { navigate } from "../lib/router";
import type { User } from "../types";
import { Button } from "../components/ui/Button";

export function PendingApprovalPage({ user }: { user: User }) {
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
        <span className="eyebrow">Корпоративний доступ</span>
        <h1>
          {user.emailVerified
            ? "Профіль очікує схвалення"
            : "Спочатку підтвердьте email"}
        </h1>
        <p>
          {user.emailVerified
            ? "Адміністратор перевірить обліковий запис. Внутрішній розклад та імена колег до цього залишаються закритими."
            : "Ми надіслали посилання на корпоративну адресу. У dev-режимі воно також доступне в журналі API."}
        </p>
        <div className="status-card__meta">
          <span>{user.name}</span>
          <strong>{user.email}</strong>
        </div>
        <div className="button-row">
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ["me"] })}
          >
            Оновити статус
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Вийти
          </Button>
        </div>
      </div>
    </div>
  );
}
