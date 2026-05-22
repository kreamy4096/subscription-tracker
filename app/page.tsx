"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import ReminderSettingsModal from "@/components/ReminderSettingsModal";
import SubscriptionModal from "@/components/SubscriptionModal";
import type { Subscription } from "@/lib/subscription-types";

const navItems = [
  { icon: "dashboard", label: "Overview", active: true },
  { icon: "payments", label: "Subscriptions" },
  { icon: "receipt_long", label: "Billing" },
  { icon: "monitoring", label: "Analytics" },
];

const footerItems = [
  { icon: "help_outline", label: "Support" },
  { icon: "person", label: "Account" },
];

const seedSubscriptions: Subscription[] = [
  {
    id: "seed-1",
    tool: "Figma",
    subscription: "Organization",
    due_date: "May 24, 2026",
    price: "$45",
    login_email: "design@subtrack.co",
    login_password: "",
    action: "Renewal",
    payment_status: "Paid",
  },
  {
    id: "seed-2",
    tool: "Notion",
    subscription: "Business",
    due_date: "May 26, 2026",
    price: "$18",
    login_email: "ops@subtrack.co",
    login_password: "",
    action: "Upgrade",
    payment_status: "Pending",
  },
  {
    id: "seed-3",
    tool: "Slack",
    subscription: "Pro",
    due_date: "Jun 2, 2026",
    price: "$12",
    login_email: "team@subtrack.co",
    login_password: "",
    action: "Renewal",
    payment_status: "Paid",
  },
];

const avatarBackgrounds = [
  "bg-primary-fixed text-primary",
  "bg-secondary-container text-hunter-cyan",
  "bg-tertiary-fixed text-tertiary",
  "bg-error-container text-error",
  "bg-surface-container-high text-secondary",
];

const MASKED_PASSWORD = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

function normalizeSubscription(
  item: Partial<Subscription> & { id: string },
): Subscription {
  return {
    id: item.id,
    tool: item.tool ?? "",
    subscription: item.subscription ?? "",
    due_date: item.due_date ?? "",
    price: item.price ?? "",
    login_email: item.login_email ?? "",
    login_password: item.login_password ?? "",
    has_login_password:
      item.has_login_password ?? Boolean(item.login_password),
    action: item.action ?? "",
    payment_status: item.payment_status ?? "",
    created_at: item.created_at,
  };
}

function parsePrice(value: string | null | undefined) {
  const numeric = Number.parseFloat((value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDueDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDueDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const dueDate = parseDueDate(value);
  if (!dueDate) {
    return value;
  }

  return dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isDueThisMonth(value: string | null | undefined) {
  const dueDate = parseDueDate(value);
  if (!dueDate) {
    return false;
  }

  const now = new Date();
  return (
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getFullYear() === now.getFullYear()
  );
}

function getActionBadgeClasses(action: string) {
  switch (action) {
    case "PAYG Renewal":
      return "bg-primary-fixed text-on-primary-fixed-variant";
    case "Upgrade":
      return "bg-secondary-container text-on-secondary-container";
    case "FREE":
      return "bg-primary-fixed text-primary";
    case "Canceled":
      return "bg-error-container text-error";
    default:
      return "bg-tertiary-fixed text-tertiary";
  }
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "Paid":
      return "bg-success/10 text-success";
    case "Pending":
      return "bg-warning/10 text-warning";
    default:
      return "bg-error-container text-error";
  }
}

function getAvatarClasses(tool: string) {
  const sum = tool
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return avatarBackgrounds[sum % avatarBackgrounds.length];
}

export default function Home() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  const [isReminderSettingsOpen, setIsReminderSettingsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [selectedSubscription, setSelectedSubscription] =
    useState<Subscription | null>(null);
  const [openCredentialsId, setOpenCredentialsId] = useState<string | null>(null);
  const [popoverPasswordVisible, setPopoverPasswordVisible] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const credentialsPopoverRef = useRef<HTMLDivElement | null>(null);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  useEffect(() => {
    const loadSubscriptions = async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/subscriptions");
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Unable to load subscriptions.");
          setSubscriptions(seedSubscriptions);
          return;
        }

        setSubscriptions(
          data.length > 0
            ? data.map((item: Subscription) => normalizeSubscription(item))
            : seedSubscriptions,
        );
      } catch (loadError) {
        console.error("Failed to load subscriptions:", loadError);
        setError("Database unavailable. Showing local preview data.");
        setSubscriptions(seedSubscriptions);
      } finally {
        setIsLoading(false);
      }
    };

    void loadSubscriptions();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        credentialsPopoverRef.current &&
        !credentialsPopoverRef.current.contains(event.target as Node)
      ) {
        setOpenCredentialsId(null);
        setPopoverPasswordVisible(false);
      }
    };

    if (openCredentialsId) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [openCredentialsId]);

  const filteredSubscriptions = subscriptions.filter((item) => {
    const matchesSearch =
      deferredSearch.length === 0 ||
      [
        item.tool,
        item.subscription,
        item.price,
        item.payment_status,
        item.action,
      ]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch);

    const matchesPayment =
      paymentFilter === "All" || item.payment_status === paymentFilter;
    const matchesAction = actionFilter === "All" || item.action === actionFilter;

    return matchesSearch && matchesPayment && matchesAction;
  });

  const totalMonthlySpend = filteredSubscriptions.reduce(
    (sum, item) => sum + parsePrice(item.price),
    0,
  );
  const activeSubscriptions = filteredSubscriptions.length;
  const unpaidTools = filteredSubscriptions.filter((item) =>
    ["Not Paid", "Pending"].includes(item.payment_status),
  ).length;
  const dueThisMonth = filteredSubscriptions.filter((item) =>
    isDueThisMonth(item.due_date),
  ).length;

  const handleOpenAdd = () => {
    setSelectedSubscription(null);
    setModalMode("add");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setModalMode("edit");
    setIsModalOpen(true);
  };

  const handleSaved = (savedSubscription: Subscription) => {
    setSubscriptions((current) => {
      const existingIndex = current.findIndex(
        (item) => item.id === savedSubscription.id,
      );

      if (existingIndex === -1) {
        return [
          normalizeSubscription(savedSubscription),
          ...current.filter((item) => !item.id.startsWith("seed-")),
        ];
      }

      return current.map((item) =>
        item.id === savedSubscription.id
          ? normalizeSubscription(savedSubscription)
          : item,
      );
    });
  };

  const handleDeleted = (subscriptionId: string) => {
    setSubscriptions((current) =>
      current.filter((item) => item.id !== subscriptionId),
    );
  };

  const handleDeleteFromTable = async (subscription: Subscription) => {
    const confirmed = window.confirm(
      `Delete ${subscription.tool || "this subscription"}?`,
    );
    if (!confirmed) {
      return;
    }

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

      handleDeleted(subscription.id);
    } catch (deleteError) {
      console.error("Failed to delete subscription:", deleteError);
      setError("A network error occurred while deleting the subscription.");
    }
  };

  const handleStatusChange = async (
    subscription: Subscription,
    paymentStatus: string,
  ) => {
    setStatusSavingId(subscription.id);
    setError("");

    try {
      const response = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...subscription,
          payment_status: paymentStatus,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to update payment status.");
        return;
      }

      setSubscriptions((current) =>
        current.map((item) =>
          item.id === subscription.id ? normalizeSubscription(data) : item,
        ),
      );
    } catch (statusError) {
      console.error("Failed to update payment status:", statusError);
      setError("A network error occurred while updating payment status.");
    } finally {
      setStatusSavingId(null);
    }
  };

  const toggleCredentialsPopover = (subscriptionId: string) => {
    if (openCredentialsId === subscriptionId) {
      setOpenCredentialsId(null);
      setPopoverPasswordVisible(false);
      return;
    }

    setOpenCredentialsId(subscriptionId);
    setPopoverPasswordVisible(false);
  };
  return (
    <>
      <aside className="fixed top-0 left-0 z-50 hidden h-screen w-[240px] flex-col border-r border-surface-container-high bg-surface lg:flex">
        <div className="px-[21px] py-[29px]">
          <h1 className="text-headline-md font-headline-md font-bold text-primary">
            SubTrack Pro
          </h1>
          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container">
              <span className="material-symbols-outlined text-on-primary-container">
                dashboard
              </span>
            </div>
            <div>
              <p className="text-label-md font-bold text-on-surface">Workforce</p>
              <p className="text-label-sm text-secondary">Enterprise Tier</p>
            </div>
          </div>
        </div>

        <nav className="mt-4 flex-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`flex w-full items-center gap-3 px-[21px] py-[9px] text-left transition-colors duration-200 ${
                item.active
                  ? "border-r-2 border-primary font-bold text-primary"
                  : "text-secondary hover:bg-surface-container-low"
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-label-md">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="border-t border-surface-container-high ui-panel-pad">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary ui-button-pad-lg text-label-md text-on-primary transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Subscription
          </button>
        </div>

        <div className="pb-8">
          {footerItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-3 px-[21px] py-[9px] text-left text-secondary transition-colors duration-200 hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-label-md">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="min-h-screen px-[13px] py-[21px] sm:px-[21px] lg:ml-[240px] lg:p-[29px]">
        <header className="mb-gutter flex flex-col gap-5 rounded-[20px] border border-white/50 bg-white/70 p-[21px] shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase lg:hidden">
              SubTrack Pro
            </p>
            <h2 className="mt-1 text-headline-lg-mobile font-semibold text-on-surface lg:text-headline-lg">
              Dashboard Overview
            </h2>
            <p className="text-body-md text-secondary">
              Manage your recurring expenses and service plans.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsReminderSettingsOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-outline-variant ui-button-pad text-label-md text-secondary transition-colors hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              Reminder Settings
            </button>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-2 rounded-xl bg-primary ui-button-pad text-label-md text-on-primary transition-opacity hover:opacity-90 lg:hidden"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add Subscription
            </button>
            <div className="hidden gap-2 sm:flex">
              <span className="material-symbols-outlined cursor-pointer rounded-full p-2 text-secondary hover:bg-surface-container-high">
                notifications
              </span>
              <button
                type="button"
                onClick={() => setIsReminderSettingsOpen(true)}
                className="rounded-full p-2 text-secondary transition-colors hover:bg-surface-container-high"
                aria-label="Open reminder settings"
              >
                <span className="material-symbols-outlined text-[24px]">
                  settings
                </span>
              </button>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high bg-surface-container-low text-[11px] font-semibold text-primary">
              AA
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-warning/20 bg-tertiary-fixed ui-button-pad-lg text-[11px] text-on-surface">
            {error}
          </div>
        ) : null}

        <section className="mb-gutter grid grid-cols-1 gap-gutter md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad transition-all hover:border-primary">
            <div className="mb-4 flex items-start justify-between">
              <span className="material-symbols-outlined rounded-lg bg-primary-fixed p-[5px] text-primary">
                account_balance_wallet
              </span>
              <span className="text-label-sm text-success">Live total</span>
            </div>
            <p className="text-label-md tracking-wider text-secondary uppercase">
              Total Monthly Spend
            </p>
            <h3 className="mt-1 text-display-lg font-bold text-on-surface">
              ${totalMonthlySpend.toFixed(0)}
            </h3>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad transition-all hover:border-primary">
            <div className="mb-4 flex items-start justify-between">
              <span className="material-symbols-outlined rounded-lg bg-secondary-container p-[5px] text-hunter-cyan">
                subscriptions
              </span>
            </div>
            <p className="text-label-md tracking-wider text-secondary uppercase">
              Active Subscriptions
            </p>
            <h3 className="mt-1 text-display-lg font-bold text-on-surface">
              {activeSubscriptions}
            </h3>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad transition-all hover:border-error">
            <div className="mb-4 flex items-start justify-between">
              <span className="material-symbols-outlined rounded-lg bg-error-container p-[5px] text-error">
                pending_actions
              </span>
            </div>
            <p className="text-label-md tracking-wider text-secondary uppercase">
              Unpaid Tools
            </p>
            <h3 className="mt-1 text-display-lg font-bold text-on-surface">
              {unpaidTools}
            </h3>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad transition-all hover:border-warning">
            <div className="mb-4 flex items-start justify-between">
              <span className="material-symbols-outlined rounded-lg bg-tertiary-fixed p-[5px] text-warning">
                event_upcoming
              </span>
            </div>
            <p className="text-label-md tracking-wider text-secondary uppercase">
              Due This Month
            </p>
            <h3 className="mt-1 text-display-lg font-bold text-on-surface">
              {dueThisMonth}
            </h3>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest ui-panel-pad">
          <div className="relative min-w-[280px] flex-1">
            <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-secondary">
              search
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tools..."
              className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low pr-[13px] pl-[37px] text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={(event) => setPaymentFilter(event.target.value)}
            className="h-11 rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad text-body-md text-on-surface-variant outline-none"
          >
            <option value="All">Payment Status: All</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Not Paid">Not Paid</option>
          </select>

          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="h-11 rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad text-body-md text-on-surface-variant outline-none"
          >
            <option value="All">Action: All</option>
            <option value="Renewal">Renewal</option>
            <option value="PAYG Renewal">PAYG Renewal</option>
            <option value="Upgrade">Upgrade</option>
            <option value="Canceled">Canceled</option>
            <option value="FREE">FREE</option>
          </select>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="hidden items-center gap-2 rounded-lg bg-primary ui-button-pad-lg text-label-md text-on-primary transition-opacity hover:opacity-90 sm:flex"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Subscription
          </button>
        </section>

        <section className="mt-6 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-low">
                  {[
                    "Tool",
                    "Plan",
                    "Due Date",
                    "Price",
                    "Credentials",
                    "Action",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className={`ui-table-cell text-label-md tracking-wider text-secondary uppercase ${
                        heading === "Actions" ? "text-right" : ""
                      }`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="ui-table-empty text-center text-secondary">
                      Loading subscriptions...
                    </td>
                  </tr>
                ) : filteredSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="ui-table-empty text-center text-secondary">
                      No subscriptions match your filters yet.
                    </td>
                  </tr>
                ) : (
                  filteredSubscriptions.map((item) => (
                    <tr
                      key={item.id}
                      className="group transition-colors hover:bg-surface-container-low"
                    >
                      <td className="ui-table-cell">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg text-[9px] font-semibold ${getAvatarClasses(item.tool)}`}
                          >
                            {item.tool.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-body-md font-semibold text-on-surface">
                              {item.tool}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="ui-table-cell text-body-md text-on-surface-variant">
                        {item.subscription || "-"}
                      </td>
                      <td className="ui-table-cell text-body-md text-on-surface-variant">
                        {formatDueDate(item.due_date)}
                      </td>
                      <td className="ui-table-cell text-body-md font-semibold text-on-surface">
                        {item.price || "-"}
                      </td>
                      <td className="relative ui-table-cell">
                        <button
                          type="button"
                          onClick={() => toggleCredentialsPopover(item.id)}
                          className="rounded-full border border-outline-variant p-2 text-secondary transition-colors hover:bg-surface-container-high hover:text-primary"
                          aria-label="View credentials"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            key
                          </span>
                        </button>

                        {openCredentialsId === item.id ? (
                          <div
                            ref={credentialsPopoverRef}
                            className="absolute top-[calc(100%-8px)] left-0 z-20 w-[320px] rounded-2xl border border-outline-variant bg-surface-container-lowest ui-panel-pad shadow-[0_18px_42px_rgba(25,28,29,0.12)]"
                          >
                            <div className="mb-3 flex items-center gap-2 text-primary">
                              <span className="material-symbols-outlined text-[18px]">
                                key
                              </span>
                              <p className="text-label-md font-semibold uppercase tracking-[0.16em]">
                                Credentials
                              </p>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <p className="mb-2 text-label-md font-semibold text-on-surface">
                                  Login Email
                                </p>
                                <div className="rounded-xl border border-outline-variant bg-surface-container-low ui-button-pad-lg text-body-md text-on-surface">
                                  {item.login_email || "-"}
                                </div>
                              </div>

                              <div>
                                <p className="mb-2 text-label-md font-semibold text-on-surface">
                                  Password
                                </p>
                                <div className="flex items-center overflow-hidden rounded-xl border border-outline-variant bg-surface-container-low">
                                  <div className="flex-1 ui-button-pad-lg text-body-md text-on-surface">
                                    {item.login_password
                                      ? popoverPasswordVisible
                                        ? item.login_password
                                        : MASKED_PASSWORD
                                      : "-"}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPopoverPasswordVisible((current) => !current)
                                    }
                                    className="border-l border-outline-variant px-[9px] py-[9px] text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                                    aria-label={
                                      popoverPasswordVisible
                                        ? "Hide password"
                                        : "Show password"
                                    }
                                  >
                                    <span className="material-symbols-outlined text-[18px]">
                                      {popoverPasswordVisible
                                        ? "visibility_off"
                                        : "visibility"}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="ui-table-cell">
                        <span
                          className={`inline-flex rounded-full ui-badge-pad text-label-sm font-semibold ${getActionBadgeClasses(item.action)}`}
                        >
                          {item.action || "-"}
                        </span>
                      </td>
                      <td className="ui-table-cell">
                        <select
                          value={item.payment_status || "Not Paid"}
                          disabled={statusSavingId === item.id}
                          onChange={(event) =>
                            void handleStatusChange(item, event.target.value)
                          }
                          className={`rounded-full border ui-badge-pad text-label-sm font-semibold outline-none transition-colors ${getStatusBadgeClasses(
                            item.payment_status || "Not Paid",
                          )} ${
                            statusSavingId === item.id
                              ? "cursor-wait opacity-70"
                              : "cursor-pointer"
                          }`}
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                          <option value="Not Paid">Not Paid</option>
                        </select>
                      </td>
                      <td className="ui-table-cell text-right">
                        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="rounded-full p-0.5 text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                            aria-label={`Edit ${item.tool}`}
                          >
                            <span className="material-symbols-outlined text-[9px]">
                              edit
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteFromTable(item)}
                            className="rounded-full p-0.5 text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
                            aria-label={`Delete ${item.tool}`}
                          >
                            <span className="material-symbols-outlined text-[9px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SubscriptionModal
        key={`${modalMode}-${selectedSubscription?.id ?? "new"}-${isModalOpen ? "open" : "closed"}`}
        isOpen={isModalOpen}
        mode={modalMode}
        subscription={selectedSubscription}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />

      <ReminderSettingsModal
        isOpen={isReminderSettingsOpen}
        onClose={() => setIsReminderSettingsOpen(false)}
      />
    </>
  );
}
