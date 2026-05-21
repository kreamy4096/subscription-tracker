"use client";

import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }

      window.location.href = "/";
    } catch (loginError) {
      console.error("Failed to sign in:", loginError);
      setError("A network error occurred while signing in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
          SubTrack Pro
        </p>
        <h1 className="mt-2 text-[28px] font-semibold text-on-surface">
          Sign in
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-label-md font-semibold text-on-surface">
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              autoComplete="username"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-label-md font-semibold text-on-surface">
              Password
            </span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              autoComplete="current-password"
              type="password"
              required
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-error/20 bg-error-container px-3 py-2 text-sm text-error">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
