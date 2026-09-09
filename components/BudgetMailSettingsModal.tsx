"use client";

import { useEffect, useState } from "react";
import type {
  BudgetMailSettings,
  ReminderRecipient,
} from "@/lib/subscription-types";

interface BudgetMailSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify?: (message: {
    title: string;
    description?: string;
    tone?: "success" | "error" | "info";
  }) => void;
}

type RecipientDraft = Pick<
  ReminderRecipient,
  "email" | "is_primary" | "is_active" | "sort_order"
> & { id: string };

function makeDraftId() {
  return `budget-recipient-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function ensurePrimary(recipients: RecipientDraft[]) {
  const firstActiveIndex = recipients.findIndex((recipient) => recipient.is_active);
  const primaryIndex = recipients.findIndex(
    (recipient) => recipient.is_primary && recipient.is_active,
  );

  return recipients.map((recipient, index) => ({
    ...recipient,
    sort_order: index,
    is_primary:
      recipient.is_active &&
      (primaryIndex === -1 ? index === firstActiveIndex : index === primaryIndex),
  }));
}

function normalizeRecipients(recipients: ReminderRecipient[]) {
  return ensurePrimary(
    [...recipients]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((recipient, index) => ({
        id: recipient.id || makeDraftId(),
        email: recipient.email,
        is_primary: recipient.is_primary,
        is_active: recipient.is_active !== false,
        sort_order: index,
      })),
  );
}

export default function BudgetMailSettingsModal({
  isOpen,
  onClose,
  onNotify,
}: BudgetMailSettingsModalProps) {
  const [enabled, setEnabled] = useState(true);
  const [sendDay, setSendDay] = useState(1);
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const loadSettings = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/budget-settings", {
          cache: "no-store",
        });
        const data = (await response.json()) as BudgetMailSettings & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "Unable to load budget mail settings.");
        }

        setEnabled(data.enabled !== false);
        setSendDay(data.send_day ?? 1);
        setRecipients(normalizeRecipients(data.recipients ?? []));
        setNewEmail("");
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Unable to load budget mail settings.";
        setError(message);
        onNotify?.({
          title: "Budget mail settings not loaded",
          description: message,
          tone: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void loadSettings();
  }, [isOpen, onNotify]);

  const handleAddRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (recipients.some((recipient) => recipient.email.toLowerCase() === email)) {
      setError("That email is already a budget report recipient.");
      return;
    }

    setRecipients((current) =>
      ensurePrimary([
        ...current,
        {
          id: makeDraftId(),
          email,
          is_primary: current.every((recipient) => !recipient.is_active),
          is_active: true,
          sort_order: current.length,
        },
      ]),
    );
    setNewEmail("");
    setError("");
  };

  const handleToggleActive = (id: string) => {
    setRecipients((current) =>
      ensurePrimary(
        current.map((recipient) =>
          recipient.id === id
            ? {
                ...recipient,
                is_active: !recipient.is_active,
                is_primary: recipient.is_active ? false : recipient.is_primary,
              }
            : recipient,
        ),
      ),
    );
  };

  const handleSetPrimary = (id: string) => {
    setRecipients((current) =>
      current.map((recipient) => ({
        ...recipient,
        is_active: recipient.id === id ? true : recipient.is_active,
        is_primary: recipient.id === id,
      })),
    );
  };

  const handleDeleteRecipient = (id: string) => {
    setRecipients((current) =>
      ensurePrimary(current.filter((recipient) => recipient.id !== id)),
    );
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/budget-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, send_day: sendDay, recipients }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to save budget mail settings.");
        return;
      }

      onNotify?.({
        title: "Budget mail settings saved",
        description: "Monthly report delivery recipients were updated.",
        tone: "success",
      });
      onClose();
    } catch (saveError) {
      console.error("Failed to save budget mail settings:", saveError);
      setError("A network error occurred while saving settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[70] transition-all duration-300 ${
        isOpen ? "visible" : "invisible pointer-events-none"
      }`}
    >
      <div
        className={`absolute inset-0 bg-inverse-surface/20 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`absolute top-1/2 left-1/2 flex max-h-[calc(100svh-2rem)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-2xl transition-all duration-300 ${
          isOpen
            ? "visible translate-y-[-50%] opacity-100"
            : "invisible translate-y-[-46%] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between border-b border-surface-container-high px-[29px] py-[21px]">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
              Monthly Budget
            </p>
            <h2 className="mt-2 text-[25px] font-semibold text-on-surface">
              Budget Mail Settings
            </h2>
            <p className="mt-2 max-w-xl text-body-md text-on-surface-variant">
              Choose who receives the monthly summary and its downloadable PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-secondary transition-colors hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Close budget mail settings"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="min-h-0 overflow-y-auto px-[29px] py-[21px]"
        >
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 text-secondary">
              <span className="material-symbols-outlined animate-spin text-[27px]">
                refresh
              </span>
              <p className="text-body-md">Loading settings...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-low ui-panel-pad">
                <div>
                  <p className="text-label-md font-semibold text-on-surface">
                    Monthly budget email
                  </p>
                  <p className="mt-1 text-label-sm text-secondary">
                    Sent monthly on your selected day and available on demand.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled((current) => !current)}
                  className={`rounded-full border ui-button-pad text-label-md font-semibold transition-colors ${
                    enabled
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant text-secondary"
                  }`}
                >
                  {enabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <label className="mt-[21px] block rounded-xl border border-outline-variant bg-surface-container-low ui-panel-pad">
                <span className="mb-2 block text-label-md font-semibold text-on-surface">
                  Monthly email day
                </span>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={sendDay}
                  onChange={(event) => setSendDay(Number.parseInt(event.target.value, 10) || 1)}
                  className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest ui-control-pad text-body-md outline-none focus:border-primary focus:ring-2 focus:ring-primary"
                  required
                />
                <p className="mt-2 text-label-sm text-secondary">
                  Pending postpaid bill reminders are sent three days before this date.
                </p>
              </label>

              <div className="mt-[21px] overflow-hidden rounded-xl border border-outline-variant">
                {recipients.length === 0 ? (
                  <div className="p-[21px] text-center text-body-md text-secondary">
                    No budget report recipients have been added.
                  </div>
                ) : (
                  recipients.map((recipient) => (
                    <div
                      key={recipient.id}
                      className="flex flex-wrap items-center gap-3 border-b border-surface-container-high px-[13px] py-[11px] last:border-b-0"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-label-md font-semibold text-primary">
                        {recipient.email.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-[180px] flex-1">
                        <p className="truncate text-body-md font-semibold text-on-surface">
                          {recipient.email}
                        </p>
                        <p className="text-label-sm text-secondary">
                          {recipient.is_active
                            ? recipient.is_primary
                              ? "Primary recipient (To)"
                              : "Copied recipient (CC)"
                            : "Inactive"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(recipient.id)}
                        className={`rounded-full border ui-badge-pad text-label-sm font-semibold ${
                          recipient.is_active
                            ? "border-success bg-success/10 text-success"
                            : "border-outline-variant text-secondary"
                        }`}
                      >
                        {recipient.is_active ? "Active" : "Inactive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(recipient.id)}
                        className={`rounded-full border ui-badge-pad text-label-sm font-semibold ${
                          recipient.is_primary
                            ? "border-primary bg-primary text-on-primary"
                            : "border-outline-variant text-secondary"
                        }`}
                      >
                        Primary
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecipient(recipient.id)}
                        className="rounded-full p-2 text-secondary transition-colors hover:bg-error-container hover:text-error"
                        aria-label={`Delete ${recipient.email}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-[21px] rounded-xl border border-outline-variant bg-surface-container-low ui-panel-pad">
                <label className="block">
                  <span className="mb-2 block text-label-md font-semibold text-on-surface">
                    Add recipient
                  </span>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="finance@company.com"
                      className="h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={handleAddRecipient}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        add
                      </span>
                      Add
                    </button>
                  </div>
                </label>
              </div>

              {error ? (
                <div className="mt-[13px] rounded-lg border border-error/20 bg-error-container ui-button-pad text-body-md text-error">
                  {error}
                </div>
              ) : null}

              <div className="sticky bottom-0 -mx-[29px] mt-8 flex items-center justify-end gap-3 border-t border-surface-container-high bg-surface-container-lowest px-[29px] pt-5 pb-[21px]">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-outline-variant ui-button-pad-lg text-label-md font-semibold text-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
