"use client";

import { useState } from "react";
import {
  normalizeSubscriptionPlan,
  subscriptionPlanOptions,
  type Subscription,
} from "@/lib/subscription-types";
import { getReminderStartDate } from "@/lib/subscription-dates";

interface SubscriptionModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  subscription: Subscription | null;
  onClose: () => void;
  onSaved: (subscription: Subscription) => void;
  onDeleted: (subscriptionId: string) => void;
  onNotify?: (message: {
    title: string;
    description?: string;
    tone?: "success" | "error" | "info";
  }) => void;
}

type SubscriptionFormState = Omit<Subscription, "id" | "created_at">;

const emptyForm: SubscriptionFormState = {
  tool: "",
  subscription: "",
  due_date: "",
  billing_type: "one_time",
  recurrence_day: null,
  next_due_date: "",
  price: "",
  estimated_monthly_budget: "",
  last_top_up_date: "",
  current_balance: "",
  payg_top_ups: [],
  login_email: "",
  login_password: "",
  action: "Renewal",
  payment_status: "Pending",
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

  const normalizedDate = toDateInputValue(
    subscription.next_due_date || subscription.due_date || "",
  );

  return {
    tool: subscription.tool || "",
    subscription: normalizeSubscriptionPlan(
      subscription.subscription,
      subscription.action,
    ),
    due_date: normalizedDate,
    billing_type: subscription.billing_type || "one_time",
    recurrence_day: subscription.recurrence_day ?? null,
    next_due_date: normalizedDate,
    price: normalizePriceValue(subscription.price || ""),
    estimated_monthly_budget: normalizePriceValue(
      subscription.estimated_monthly_budget || subscription.price || "",
    ),
    last_top_up_date: toDateInputValue(
      subscription.last_top_up_date || subscription.due_date || "",
    ),
    current_balance: subscription.current_balance
      ? normalizePriceValue(subscription.current_balance)
      : "",
    payg_top_ups: subscription.payg_top_ups ?? [],
    login_email: subscription.login_email || "",
    login_password: subscription.login_password || "",
    action: subscription.action || "Renewal",
    payment_status: subscription.payment_status || "Pending",
  };
}

export default function SubscriptionModal({
  isOpen,
  mode,
  subscription,
  onClose,
  onSaved,
  onDeleted,
  onNotify,
}: SubscriptionModalProps) {
  const [formData, setFormData] = useState(() =>
    getInitialFormState(mode === "edit" ? subscription : null),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const isFreePlan = formData.subscription === "Free";
  const isPaygPlan = formData.subscription === "PAYG";
  const reminderPreview = !isFreePlan && !isPaygPlan && formData.due_date
    ? getReminderStartDate(formData.due_date, 3)
    : "";

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => {
      if (name === "subscription") {
        if (value === "Free") {
          return {
            ...current,
            subscription: value,
            due_date: "",
            next_due_date: "",
            billing_type: "one_time",
            recurrence_day: null,
            price: "$0",
            action: "FREE",
            payment_status: "",
          };
        }

        return {
          ...current,
          subscription: value,
          action: value === "PAYG" ? "PAYG Renewal" : "Renewal",
          billing_type: value === "PAYG" ? "monthly" : current.billing_type,
          payment_status: current.payment_status || "Pending",
          price: current.price === "$0" ? "" : current.price,
          estimated_monthly_budget:
            value === "PAYG"
              ? current.estimated_monthly_budget ||
                (current.price === "$0" ? "" : current.price)
              : current.estimated_monthly_budget,
        };
      }

      return {
        ...current,
        [name]: ["price", "estimated_monthly_budget", "current_balance"].includes(name)
          ? value
            ? normalizePriceValue(value)
            : ""
          : value,
      };
    });
  };

  const addTopUpEntry = () => {
    setFormData((current) => ({
      ...current,
      payg_top_ups: [
        ...(current.payg_top_ups ?? []),
        {
          id: globalThis.crypto?.randomUUID?.() ?? `topup-${Date.now()}`,
          date: new Date().toISOString().slice(0, 10),
          amount: "",
        },
      ],
    }));
  };

  const updateTopUpEntry = (
    id: string,
    field: "date" | "amount",
    value: string,
  ) => {
    setFormData((current) => ({
      ...current,
      payg_top_ups: (current.payg_top_ups ?? []).map((topUp) =>
        topUp.id === id
          ? {
              ...topUp,
              [field]:
                field === "amount" && value ? normalizePriceValue(value) : value,
            }
          : topUp,
      ),
    }));
  };

  const removeTopUpEntry = (id: string) => {
    setFormData((current) => ({
      ...current,
      payg_top_ups: (current.payg_top_ups ?? []).filter(
        (topUp) => topUp.id !== id,
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");

    const payload = isFreePlan
      ? {
          ...formData,
          due_date: "",
          next_due_date: "",
          billing_type: "one_time" as const,
          recurrence_day: null,
          price: "$0",
          action: "FREE",
          payment_status: "",
        }
      : isPaygPlan
        ? {
            ...formData,
            due_date: formData.last_top_up_date || "",
            next_due_date: "",
            billing_type: "monthly" as const,
            recurrence_day: null,
            price: formData.estimated_monthly_budget || "",
            action: mode === "add" ? "PAYG Renewal" : formData.action,
          }
        : {
          ...formData,
          next_due_date: formData.due_date,
          recurrence_day:
            formData.billing_type === "one_time" || !formData.due_date
              ? null
              : Number.parseInt(formData.due_date.slice(8, 10), 10),
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
        onNotify?.({
          title: "Subscription not saved",
          description: data.error || "Unable to save subscription.",
          tone: "error",
        });
        return;
      }

      onSaved(data);
      onClose();
    } catch (submitError) {
      console.error("Failed to save subscription:", submitError);
      setError("A network error occurred while saving.");
      onNotify?.({
        title: "Subscription not saved",
        description: "A network error occurred while saving.",
        tone: "error",
      });
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
        onNotify?.({
          title: "Delete failed",
          description: data.error || "Unable to delete subscription.",
          tone: "error",
        });
        return;
      }

      onDeleted(subscription.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (deleteError) {
      console.error("Failed to delete subscription:", deleteError);
      setError("A network error occurred while deleting.");
      onNotify?.({
        title: "Delete failed",
        description: "A network error occurred while deleting.",
        tone: "error",
      });
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
        className={`absolute top-1/2 left-1/2 flex max-h-[calc(100svh-2rem)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-2xl transition-all duration-300 ${
          isOpen
            ? "visible translate-y-[-50%] opacity-100"
            : "invisible translate-y-[-46%] opacity-0"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-surface-container-high px-[29px] py-[21px]">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
              {mode === "add" ? "New Entry" : "Update Entry"}
            </p>
            <h2 className="mt-2 text-[25px] font-semibold tracking-normal text-on-surface">
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

        <form
          onSubmit={handleSubmit}
          className="min-h-0 overflow-y-auto px-[29px] py-[21px]"
        >
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
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Plan / Subscription
              </span>
              <select
                name="subscription"
                value={formData.subscription}
                onChange={handleChange}
                required
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              >
                <option value="" disabled>
                  Select a plan type
                </option>
                {subscriptionPlanOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {isFreePlan ? (
              <div className="rounded-xl border border-primary/20 bg-primary-fixed/40 ui-panel-pad md:col-span-2">
                <p className="text-label-md font-semibold text-primary">
                  Free subscription
                </p>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  No billing details are needed. The action is set to FREE, and
                  this subscription will not appear in renewal reminder emails.
                </p>
              </div>
            ) : isPaygPlan ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-label-md font-semibold text-on-surface">
                    Last Top-up Date
                  </span>
                  <input
                    name="last_top_up_date"
                    value={formData.last_top_up_date || ""}
                    onChange={handleChange}
                    type="date"
                    className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-2 text-label-sm text-secondary">
                    The most recent date funds were added.
                  </p>
                </label>

                <label className="block">
                  <span className="mb-2 block text-label-md font-semibold text-on-surface">
                    Current Balance <span className="font-normal text-secondary">(optional)</span>
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body-md text-secondary">$</span>
                    <input
                      name="current_balance"
                      value={(formData.current_balance || "").replace(/^\$/, "")}
                      onChange={handleChange}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low pr-[13px] pl-[29px] text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-2 block text-label-md font-semibold text-on-surface">
                    Next Due Date
                  </span>
                  <input
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleChange}
                    type="date"
                    className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                  />
                  <p className="mt-2 text-label-sm text-secondary">
                    The reminder engine tracks this exact date.
                  </p>
                </label>

                <label className="block">
                  <span className="mb-2 block text-label-md font-semibold text-on-surface">
                    Billing Cadence
                  </span>
                  <select
                    name="billing_type"
                    value={formData.billing_type}
                    onChange={handleChange}
                    className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                  >
                    <option value="one_time">One-time</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  <p className="mt-2 text-label-sm text-secondary">
                    Recurring plans advance after they are marked paid.
                  </p>
                </label>
              </>
            )}

            {reminderPreview ? (
              <div className="rounded-xl border border-primary/20 bg-primary-fixed/40 ui-panel-pad md:col-span-2">
                <p className="text-label-md font-semibold text-primary">
                  Reminder window preview
                </p>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  With a 3-day reminder setting, reminders would start on{" "}
                  {new Date(`${reminderPreview}T00:00:00`).toLocaleDateString(
                    "en-US",
                    {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    },
                  )}{" "}
                  and continue daily until this subscription is marked paid.
                </p>
              </div>
            ) : null}

            {!isFreePlan ? <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                {isPaygPlan ? "Estimated Monthly Budget" : "Price"}
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-body-md text-secondary">
                  $
                </span>
                <input
                  name={isPaygPlan ? "estimated_monthly_budget" : "price"}
                  value={(isPaygPlan
                    ? formData.estimated_monthly_budget || ""
                    : formData.price
                  ).replace(/^\$/, "")}
                  onChange={(event) =>
                    handleChange({
                      ...event,
                      target: {
                        ...event.target,
                        name: isPaygPlan ? "estimated_monthly_budget" : "price",
                        value: `$${event.target.value}`,
                      },
                    } as React.ChangeEvent<HTMLInputElement>)
                  }
                  inputMode="decimal"
                  placeholder="39"
                  className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low pr-[13px] pl-[29px] text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                />
              </div>
            </label> : null}

            {isPaygPlan ? (
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-panel-pad md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-label-md font-semibold text-on-surface">Actual Top-ups</p>
                    <p className="mt-1 text-label-sm text-secondary">
                      Monthly reports use the total entered here; without entries they use the estimate.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addTopUpEntry}
                    className="rounded-lg border border-outline-variant ui-button-pad text-label-md font-semibold text-primary hover:bg-surface-container-low"
                  >
                    Add top-up
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {(formData.payg_top_ups ?? []).length === 0 ? (
                    <p className="rounded-lg bg-surface-container-low ui-button-pad-lg text-body-md text-secondary">
                      No actual top-ups logged yet.
                    </p>
                  ) : (
                    (formData.payg_top_ups ?? []).map((topUp) => (
                      <div key={topUp.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <input
                          type="date"
                          value={topUp.date}
                          onChange={(event) => updateTopUpEntry(topUp.id, "date", event.target.value)}
                          className="h-11 rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none focus:border-primary"
                          required
                        />
                        <div className="relative">
                          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-secondary">$</span>
                          <input
                            value={topUp.amount.replace(/^\$/, "")}
                            onChange={(event) => updateTopUpEntry(topUp.id, "amount", event.target.value)}
                            inputMode="decimal"
                            placeholder="Amount"
                            className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low pr-[13px] pl-[29px] text-body-md outline-none focus:border-primary"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTopUpEntry(topUp.id)}
                          aria-label="Remove top-up"
                          className="h-11 rounded-xl border border-error/20 px-3 text-error hover:bg-error-container"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

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
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
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
                  className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low px-[13px] pr-[45px] text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
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

            {!isFreePlan ? <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Action
              </span>
              <select
                name="action"
                value={formData.action}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              >
                <option value="Renewal">Renewal</option>
                <option value="PAYG Renewal">PAYG Renewal</option>
                <option value="Upgrade">Upgrade</option>
                <option value="Canceled">Canceled</option>
              </select>
            </label> : null}

            {!isFreePlan ? <label className="block">
              <span className="mb-2 block text-label-md font-semibold text-on-surface">
                Payment Status
              </span>
              <select
                name="payment_status"
                value={formData.payment_status}
                onChange={handleChange}
                className="h-11 w-full rounded-xl border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Not Paid">Not Paid</option>
              </select>
            </label> : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-error/20 bg-error-container ui-button-pad-lg text-[11px] text-on-surface">
              {error}
            </div>
          ) : null}

          <div className="sticky bottom-0 -mx-[29px] mt-8 flex flex-col gap-3 border-t border-surface-container-high bg-surface-container-lowest px-[29px] pt-5 pb-[21px] sm:flex-row sm:items-center sm:justify-between">
            <div>
              {mode === "edit" ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-2 rounded-xl border border-error/25 bg-error-container ui-button-pad-lg text-label-md font-semibold text-error transition-colors hover:bg-error-container/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    delete
                  </span>
                  {isDeleting ? "Deleting..." : "Delete Subscription"}
                </button>
              ) : (
                <span className="text-[11px] text-secondary">
                  Secure credentials are stored with this record.
                </span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-outline-variant ui-button-pad-lg text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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

        {showDeleteConfirm ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-inverse-surface/20 p-[21px] backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest ui-card-pad shadow-xl">
              <p className="text-label-md font-medium tracking-[0.18em] text-error uppercase">
                Confirm Delete
              </p>
              <h3 className="mt-2 text-[17px] font-semibold text-on-surface">
                Delete this subscription?
              </h3>
              <p className="mt-3 text-body-md text-on-surface-variant">
                This action permanently removes the subscription from SubTrack
                Pro.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-xl border border-outline-variant ui-button-pad text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-xl bg-error ui-button-pad text-label-md font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
