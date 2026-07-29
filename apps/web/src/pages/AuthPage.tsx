import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Link, navigate } from "../lib/router";
import type { User } from "../types";

export function AuthPage({ path }: { path: string }) {
  if (path.startsWith("/register")) return <Register />;
  if (path.startsWith("/verify-email")) return <VerifyEmail />;
  return <Login />;
}

function AuthFrame({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand brand--auth">
          <span className="brand-mark">M</span>
          <span>MeetBroker</span>
        </div>
        <div className="auth-story__content">
          <span className="eyebrow">Простір для спільної роботи</span>
          <h1>Переговорна без зайвих повідомлень і накладок.</h1>
          <p>
            Побачте вільний час, запросіть колег і тримайте робочий день
            упорядкованим.
          </p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview__head">
            <span />
            <span />
            <span />
          </div>
          <div className="auth-preview__grid">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div>
            <span className="eyebrow">Корпоративний доступ</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

function Login() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("user@meetbroker.local");
  const [password, setPassword] = useState("User12345!");
  const login = useMutation({
    mutationFn: () =>
      api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      }),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(["me"], { user });
      navigate("/calendar", true);
    }
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <AuthFrame
      title="Раді бачити вас знову"
      subtitle="Увійдіть із корпоративною адресою."
    >
      <form className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {login.error && (
          <div className="form-error" role="alert">
            {login.error instanceof ApiError
              ? login.error.message
              : "Не вдалося увійти"}
          </div>
        )}
        <button className="button button--primary button--wide" disabled={login.isPending}>
          {login.isPending ? "Входимо…" : "Увійти"}
        </button>
      </form>
      <p className="auth-switch">
        Ще немає облікового запису?{" "}
        <Link href="/register">Зареєструватися</Link>
      </p>
    </AuthFrame>
  );
}

function Register() {
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: ""
  });
  const register = useMutation({
    mutationFn: () =>
      api<{ verificationToken?: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: ({ verificationToken }) => {
      navigate(
        verificationToken
          ? `/verify-email?token=${encodeURIComponent(verificationToken)}`
          : "/login",
        true
      );
    }
  });

  return (
    <AuthFrame
      title="Створіть профіль"
      subtitle="Після email-підтвердження адміністратор схвалить доступ."
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          register.mutate();
        }}
      >
        {(["name", "email", "password"] as const).map((field) => (
          <label className="field" key={field}>
            <span>
              {field === "name"
                ? "Ім’я"
                : field === "email"
                  ? "Email"
                  : "Пароль"}
            </span>
            <input
              type={field === "password" ? "password" : field}
              value={values[field]}
              onChange={(event) =>
                setValues({ ...values, [field]: event.target.value })
              }
              minLength={field === "password" ? 8 : undefined}
              maxLength={field === "password" ? 72 : undefined}
              required
            />
          </label>
        ))}
        {register.error && (
          <div className="form-error" role="alert">
            {register.error instanceof ApiError
              ? register.error.message
              : "Не вдалося зареєструватися"}
          </div>
        )}
        <button
          className="button button--primary button--wide"
          disabled={register.isPending}
        >
          {register.isPending ? "Створюємо…" : "Зареєструватися"}
        </button>
      </form>
      <p className="auth-switch">
        Уже маєте профіль? <Link href="/login">Увійти</Link>
      </p>
    </AuthFrame>
  );
}

function VerifyEmail() {
  const token = new URLSearchParams(window.location.search).get("token");
  const verification = useMutation({
    mutationFn: () =>
      api<void>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      })
  });

  return (
    <AuthFrame
      title="Підтвердження email"
      subtitle="Останній крок перед адміністративним схваленням."
    >
      {verification.isSuccess ? (
        <div className="success-panel">
          <strong>Email підтверджено</strong>
          <span>Тепер можна увійти й очікувати схвалення.</span>
          <Link className="button button--primary" href="/login">
            До входу
          </Link>
        </div>
      ) : (
        <div className="form-stack">
          {verification.error && (
            <div className="form-error">
              {verification.error instanceof ApiError
                ? verification.error.message
                : "Посилання недійсне"}
            </div>
          )}
          <button
            className="button button--primary button--wide"
            disabled={!token || verification.isPending}
            onClick={() => verification.mutate()}
          >
            {verification.isPending ? "Перевіряємо…" : "Підтвердити email"}
          </button>
        </div>
      )}
    </AuthFrame>
  );
}
