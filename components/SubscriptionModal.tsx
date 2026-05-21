"use client";

import { useState } from "react";
import type { Subscription } from "@/lib/subscription-types";

interface SubscriptionModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  subscription: Subscription | null;
  onClose: () => void;
  onSaved: (subscription: Subscription) => void;
  onDeleted: (subscriptionId: string) => void;
}

interface SubscriptionFormState extends Omit<Subscription, "id" | "created_at"> {
  due_date_recurring: string;
}

const emptyForm: SubscriptionFormState = {
  tool: "",
  subscription: "",
  due_date: "",
  due_date_recurring: "",
  price: "",
  login_email: "",
  login_password: "",
  action: "Renewal",
  payment_status: "Paid",
};

function toDateInputValue(value: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizePriceValue(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return "$";
  }

  const [whole, decimal] = cleaned.split(".");
  const normalizedWhole = whole || "0";
  return decimal !== undefined
    ? `$${normalizedWhole}.${decimal.slice(0, 2)}`
    : `$${normalizedWhole}`;
}

function getInitialFormState(subscription: Subscription | null) {
  if (!subscription) {
    return emptyForm;
  }

  const normalizedDate = toDateInputValue(subscription.due_date || "");
  const recurringValue = normalizedDate ? "" : subscription.due_date || "";

  return {
    tool: subscription.tool || "",
    subscription: subscription.subscription || "",
    due_date: normalizedDate,
    due_date_recurring: recurringValue,
    price: normalizePriceValue(subscription.price || ""),
    login_email: subscription.login_email || "",
    login_password: "",
    action: subscription.action || "Renewal",
    payment_status: subscription.payment_status || "Paid",
  };
}

export default function SubscriptionModal({
  isOpen,
  mode,
  subscription,
  onClose,
  onSaved,
  onDeleted,
}: SubscriptionModalProps) {
  const [formData, setFormData] = useState(() =>
    getInitialFormState(mode === "edit" ? subscription : null),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: name === "price" ? normalizePriceValue(value) : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    const payload = {
      ...formData,
      due_date: formData.due_date_recurring.trim() || formData.due_date,
    };

    const endpoint =
      mode === "edit" && subscription
        ? `/api/subscriptions/${subscription.id}`
        : "/api/subscriptions";
    const method = mode === "edit" ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to save subscription.");
        return;
      }

      onSaved(data);
      onClose();
    } catch (submitError) {
      console.error("Failed to save subscription:", submitError);
      setError("A network error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!subscription) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to delete subscription.");
        return;
      }

      onDeleted(subscription.id);
      onClose();
    } catch (deleteError) {
      console.error("Failed to delete subscription:", deleteError);
      setError("A network error occurred while deleting.");
    } finally {
      setIsDeleting(false);
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
        className={`absolute top-1/2 left-1/2 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-2xl transition-all duration-300 ${
          isOpen
            ? "visible translate-y-[-50%] opacity-100"
            : "invisible translate-y-[-46%] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between border-b border-surface-container-high px-8 py-6">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
              {mode === "add" ? "New Entry" : "Update Entry"}
            </p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-on-surface">
              {mode === "add" ? "Add Subscription" : "Edit Subscription"}
            </h2>
            <p className="mt-2 max-w-xl text-body-md text-on-surface-variant">
              Track plans, renewal dates, billing details, and secure login
              credentials in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-secondary transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Tool
              </span>
              <input
                name="tool"
                value={formData.tool}
                onChange={handleChange}
                placeholder="Netflix"
                required
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Plan / Subscription
              </span>
              <input
                name="subscription"
                value={formData.subscription}
                onChange={handleChange}
                placeholder="Premium Plan"
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Due Date
              </span>
              <input
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                type="date"
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
              <p className="mt-2 text-label-sm text-secondary">
                Use this for one-off calendar dates.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Recurring Due Date
              </span>
              <input
                name="due_date_recurring"
                value={formData.due_date_recurring}
                onChange={handleChange}
                placeholder="23rd of every month"
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
              <p className="mt-2 text-label-sm text-secondary">
                If set, this takes priority over the calendar date.
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Price
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body-md text-secondary">
                  $
                </span>
                <input
                  name="price"
                  value={formData.price.startsWith("$") ? formData.price.slice(1) : formData.price}
                  onChange={(event) =>
                    handleChange({
                      ...event,
                      target: {
                        ...event.target,
                        name: "price",
                        value: `$${event.target.value}`,
                      },
                    } as React.ChangeEvent<HTMLInputElement>)
                  }
                  inputMode="decimal"
                  placeholder="39"
                  className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low pr-4 pl-8 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Login Email
              </span>
              <input
                name="login_email"
                type="text"
                value={formData.login_email}
                onChange={handleChange}
                placeholder="account@email.com"
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Login Password
              </span>
              <div className="relative">
                <input
                  name="login_password"
                  type={showPassword ? "text" : "password"}
                  value={formData.login_password}
                  onChange={handleChange}
                  placeholder={
                    mode === "edit" && subscription?.has_login_password
                      ? "Leave blank to keep saved password"
                      : "Optional password"
                  }
                  className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 pr-12 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Action
              </span>
              <select
                name="action"
                value={formData.action}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              >
                <option value="Renewal">Renewal</option>
                <option value="Upgrade">Upgrade</option>
                <option value="Canceled">Canceled</option>
                <option value="FREE">FREE</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Payment Status
              </span>
              <select
                name="payment_status"
                value={formData.payment_status}
                onChange={handleChange}
                className="h-12 w-full rounded-xl border border-outline-variant bg-surface-container-low px-4 text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Not Paid">Not Paid</option>
              </select>
            </label>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm text-on-surface">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 border-t border-surface-container-high pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {mode === "edit" ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-error/25 bg-error-container px-4 py-3 text-label-md font-semibold text-error transition-colors hover:bg-error-container/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    delete
                  </span>
                  {isDeleting ? "Deleting..." : "Delete Subscription"}
                </button>
              ) : (
                <span className="text-sm text-secondary">
                  Secure credentials are stored with this record.
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-outline-variant px-5 py-3 text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[18px]">
                      refresh
                    </span>
                    Saving...
                  </>
                ) : mode === "add" ? (
                  "Create Subscription"
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
