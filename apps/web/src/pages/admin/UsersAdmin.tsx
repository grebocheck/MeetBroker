import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "../../components/Avatar";
import {
  capabilityLabel,
  UserAccessDialog,
} from "../../components/UserAccessDialog";
import { Button } from "../../components/ui/Button";
import { Pagination } from "../../components/ui/Pagination";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/error-message";
import { useI18n } from "../../lib/i18n";
import type { ActiveRestriction } from "../../types";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  bio: string | null;
  avatarPreset: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  approved: boolean;
  accessRevoked: boolean;
  restrictions: ActiveRestriction[];
  createdAt: string;
}

interface UserPage {
  users: AdminUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function UsersAdmin() {
  const { t } = useI18n();
  const [filter, setFilter] = useState("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = new URLSearchParams({ status: filter });
  if (search) query.set("search", search);
  query.set("page", String(page));
  query.set("limit", "12");

  const users = useQuery({
    queryKey: ["admin-users", filter, search, page],
    queryFn: () => api<UserPage>(`/api/admin/users?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });
  const action = useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      api<void>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const managingUser = users.data?.users.find(
    (user) => user.id === managingUserId,
  );

  return (
    <section className="admin-card">
      <div className="admin-card__toolbar admin-booking-toolbar">
        <div className="segmented">
          {[
            ["pending", t("admin.pending")],
            ["active", t("admin.activePlural")],
            ["revoked", t("admin.revokedPlural")],
            ["", t("admin.all")],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "is-active" : ""}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="admin-booking-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <label className="field">
            <span className="sr-only">{t("admin.searchUsers")}</span>
            <input
              type="search"
              placeholder={t("admin.userSearchPlaceholder")}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <Button type="submit" size="small">
            {t("admin.search")}
          </Button>
        </form>
        <span className="result-count">
          {t("admin.userCount", {
            count: users.data?.pagination.total ?? 0,
          })}
        </span>
      </div>
      {action.error && (
        <div className="form-error">
          {errorMessage(action.error, t, "admin.actionError")}
        </div>
      )}
      <div className="admin-user-list">
        {users.isLoading ? (
          <div className="subtle-box">{t("admin.loadingUsers")}</div>
        ) : users.error ? (
          <div className="form-error">
            {errorMessage(users.error, t, "admin.usersLoadError")}
          </div>
        ) : users.data?.users.length === 0 ? (
          <div className="empty-inline">{t("admin.usersEmpty")}</div>
        ) : (
          users.data?.users.map((user) => (
            <article className="admin-user-row" key={user.id}>
              <Avatar
                name={user.name}
                preset={user.avatarPreset}
                url={user.avatarUrl}
              />
              <div className="admin-user-row__identity">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <div className="admin-user-row__status">
                <span className="status-badge">
                  {!user.emailVerified
                    ? t("admin.emailUnverified")
                    : user.accessRevoked
                      ? t("admin.accessRevoked")
                      : user.approved
                        ? user.role === "ADMIN"
                          ? t("shell.admin")
                          : t("admin.active")
                        : t("admin.awaitingApproval")}
                </span>
                {user.restrictions.map((restriction) => (
                  <span
                    className="status-badge status-badge--warning"
                    key={restriction.id}
                  >
                    {capabilityLabel(restriction.capability, t)}
                  </span>
                ))}
              </div>
              <div className="admin-user-row__actions">
                {!user.approved &&
                  user.emailVerified &&
                  !user.accessRevoked && (
                    <Button
                      variant="primary"
                      size="small"
                      onClick={() =>
                        action.mutate({
                          path: `/api/admin/users/${user.id}/approve`,
                        })
                      }
                    >
                      {t("admin.approve")}
                    </Button>
                  )}
                {user.approved &&
                  !user.accessRevoked &&
                  (user.role === "ADMIN" ? (
                    <span className="status-badge">
                      {t("admin.cliManaged")}
                    </span>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => setManagingUserId(user.id)}
                    >
                      {t("admin.manageAccess")}
                    </Button>
                  ))}
                {user.accessRevoked && user.role !== "ADMIN" && (
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: `/api/admin/users/${user.id}/restore`,
                      })
                    }
                  >
                    {t("admin.restoreAccess")}
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {users.data && (
        <Pagination
          page={users.data.pagination.page}
          totalPages={users.data.pagination.totalPages}
          total={users.data.pagination.total}
          itemLabel={t("admin.userItems")}
          onPageChange={setPage}
        />
      )}
      {managingUser && (
        <UserAccessDialog
          user={managingUser}
          onClose={() => setManagingUserId(null)}
        />
      )}
    </section>
  );
}
