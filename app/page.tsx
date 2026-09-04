"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import BudgetMailSettingsModal from "@/components/BudgetMailSettingsModal";
import ReminderSettingsModal from "@/components/ReminderSettingsModal";
import SubscriptionModal from "@/components/SubscriptionModal";
import ToastViewport, { type ToastMessage } from "@/components/ToastViewport";
import {
  buildMonthSummary,
  buildMonthTrend,
  formatCurrency,
  getBudgetReport,
} from "@/lib/budget";
import {
  normalizeSubscriptionPlan,
  type Subscription,
} from "@/lib/subscription-types";

const navItems = [
  { icon: "dashboard", label: "Overview" },
  { icon: "savings", label: "Budget" },
  { icon: "monitoring", label: "Analytics" },
] as const;

type DashboardTab = (typeof navItems)[number]["label"];

const seedSubscriptions: Subscription[] = [
  {
    id: "seed-1",
    tool: "Figma",
    subscription: "Paid",
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
    subscription: "Paid",
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
    subscription: "Paid",
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
    subscription: normalizeSubscriptionPlan(item.subscription, item.action),
    due_date: item.due_date ?? "",
    billing_type: item.billing_type ?? "one_time",
    recurrence_day: item.recurrence_day ?? null,
    next_due_date: item.next_due_date ?? item.due_date ?? "",
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

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDueGroupLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function normalizePdfText(value: string) {
  return value.replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value: string) {
  return normalizePdfText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function truncatePdfCell(value: string, length: number) {
  const normalized = normalizePdfText(value);
  if (normalized.length <= length) {
    return normalized.padEnd(length, " ");
  }

  return `${normalized.slice(0, Math.max(0, length - 3))}...`;
}

function buildPdfDocument(
  lines: Array<{ text: string; size?: number; font?: "regular" | "bold" | "mono" }>,
) {
  const pageWidth = 612;
  const pageHeight = 792;
  const topMargin = 54;
  const bottomMargin = 54;
  const leftMargin = 48;
  const defaultSize = 11;
  const encoder = new TextEncoder();
  const pages: string[] = [];
  let currentY = pageHeight - topMargin;
  let currentCommands: string[] = [];

  const pushPage = () => {
    if (currentCommands.length > 0) {
      pages.push(currentCommands.join("\n"));
      currentCommands = [];
    }
    currentY = pageHeight - topMargin;
  };

  for (const line of lines) {
    const size = line.size ?? defaultSize;
    const lineHeight = size + 6;

    if (currentY - lineHeight < bottomMargin) {
      pushPage();
    }

    const font =
      line.font === "bold" ? "F2" : line.font === "mono" ? "F3" : "F1";
    currentCommands.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${leftMargin} ${currentY} Tm (${escapePdfText(
        line.text,
      )}) Tj ET`,
    );
    currentY -= lineHeight;
  }

  pushPage();

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  const pageRefs: string[] = [];
  let objectNumber = 6;

  for (const content of pages) {
    const contentRef = objectNumber;
    const pageRef = objectNumber + 1;
    const contentBytes = encoder.encode(content);

    objects[contentRef] =
      `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`;
    objects[pageRef] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentRef} 0 R >>`;
    pageRefs.push(`${pageRef} 0 R`);
    objectNumber += 2;
  }

  objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let index = 1; index < objects.length; index += 1) {
    const objectBody = objects[index];
    if (!objectBody) {
      continue;
    }

    offsets[index] = encoder.encode(pdf).length;
    pdf += `${index} 0 obj\n${objectBody}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < objects.length; index += 1) {
    const offset = offsets[index] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([encoder.encode(pdf)], { type: "application/pdf" });
}

export default function Home() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("Overview");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  const [isReminderSettingsOpen, setIsReminderSettingsOpen] = useState(false);
  const [isBudgetMailSettingsOpen, setIsBudgetMailSettingsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [selectedSubscription, setSelectedSubscription] =
    useState<Subscription | null>(null);
  const [openCredentialsId, setOpenCredentialsId] = useState<string | null>(null);
  const [popoverPasswordVisible, setPopoverPasswordVisible] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [isBudgetSending, setIsBudgetSending] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const credentialsPopoverRef = useRef<HTMLDivElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const showToast = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    setToasts((current) => [...current, { id, ...message }].slice(-3));
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const loadSubscriptions = useCallback(
    async () => {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/subscriptions", {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Unable to load subscriptions.");
          showToast({
            title: "Subscriptions not loaded",
            description: data.error || "Showing local preview data.",
            tone: "error",
          });
          setSubscriptions(seedSubscriptions);
          return;
        }

        setSubscriptions(
          data.map((item: Subscription) => normalizeSubscription(item)),
        );
      } catch (loadError) {
        console.error("Failed to load subscriptions:", loadError);
        setError("Database unavailable. Showing local preview data.");
        showToast({
          title: "Subscriptions not loaded",
          description: "Database unavailable. Showing local preview data.",
          tone: "error",
        });
        setSubscriptions(seedSubscriptions);
      } finally {
        setIsLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadSubscriptions();
    }, 0);

    return () => {
      window.clearTimeout(initialLoad);
    };
  }, [loadSubscriptions]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        credentialsPopoverRef.current &&
        !credentialsPopoverRef.current.contains(event.target as Node)
      ) {
        setOpenCredentialsId(null);
        setPopoverPasswordVisible(false);
      }

      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    if (openCredentialsId || isProfileMenuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isProfileMenuOpen, openCredentialsId]);

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
  const paidSubscriptions = filteredSubscriptions.filter(
    (item) => item.payment_status === "Paid",
  ).length;
  const pendingSubscriptions = filteredSubscriptions.filter(
    (item) => item.payment_status === "Pending",
  ).length;
  const notPaidSubscriptions = filteredSubscriptions.filter(
    (item) => item.payment_status === "Not Paid",
  ).length;
  const startOfToday = getStartOfToday();
  const upcomingDueEntries = subscriptions
    .filter(
      (item) => item.action !== "FREE" && item.subscription !== "Free",
    )
    .map((item) => {
      const dueDate = parseDueDate(item.next_due_date || item.due_date);

      if (!dueDate) {
        return null;
      }

      dueDate.setHours(0, 0, 0, 0);

      return {
        subscription: item,
        dueDate,
      };
    })
    .filter(
      (
        entry,
      ): entry is { subscription: Subscription; dueDate: Date } =>
        Boolean(entry),
    )
    .filter(
      (entry) =>
        entry.subscription.payment_status !== "Paid" &&
        entry.dueDate.getTime() >= startOfToday.getTime(),
    )
    .sort((first, second) => first.dueDate.getTime() - second.dueDate.getTime());
  const nextDueGroups = upcomingDueEntries.reduce<
    Array<{
      label: string;
      items: Array<{ subscription: Subscription; dueDate: Date }>;
    }>
  >((groups, entry) => {
    const label = formatDueGroupLabel(entry.dueDate);
    const existingGroup = groups[groups.length - 1];

    if (existingGroup && existingGroup.label === label) {
      existingGroup.items.push(entry);
      return groups;
    }

    groups.push({
      label,
      items: [entry],
    });
    return groups;
  }, []);
  const nextDueCount = upcomingDueEntries.length;
  const spendByStatus = [
    { label: "Paid", value: paidSubscriptions, color: "bg-success" },
    { label: "Pending", value: pendingSubscriptions, color: "bg-warning" },
    { label: "Not Paid", value: notPaidSubscriptions, color: "bg-error" },
  ];
  const budgetReport = getBudgetReport(subscriptions);
  const nextMonthForecast = buildMonthSummary(
    subscriptions,
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
  );
  const monthTrend = buildMonthTrend(subscriptions);
  const monthTrendMax = Math.max(
    1,
    ...monthTrend.map((item) => item.total),
  );
  const budgetChangeText =
    budgetReport.changePercent === null
      ? "No prior month comparison yet"
      : `${budgetReport.changePercent >= 0 ? "+" : ""}${budgetReport.changePercent.toFixed(1)}% vs last month`;
  const averageCurrentMonthCharge =
    budgetReport.currentMonth.items.length > 0
      ? budgetReport.currentMonth.total / budgetReport.currentMonth.items.length
      : 0;

  const pageTitle =
    activeTab === "Overview"
      ? "Dashboard Overview"
      : activeTab === "Budget"
        ? "Budget Planning"
        : "Analytics";
  const pageDescription =
    activeTab === "Budget"
      ? "Track last month's spend, forecast the new month, and send the monthly budget email."
      : activeTab === "Analytics"
        ? "Month-over-month subscription spending, trendlines, and upcoming billing pressure."
        : "Manage your recurring expenses and service plans.";

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
        showToast({
          title: "Subscription created",
          description: `${savedSubscription.tool || "New subscription"} was added.`,
          tone: "success",
        });
        return [
          normalizeSubscription(savedSubscription),
          ...current.filter((item) => !item.id.startsWith("seed-")),
        ];
      }

      showToast({
        title: "Subscription updated",
        description: `${savedSubscription.tool || "Subscription"} was saved.`,
        tone: "success",
      });
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

  const handleModalDeleted = (subscriptionId: string) => {
    const deletedName =
      selectedSubscription?.id === subscriptionId
        ? selectedSubscription.tool
        : "Subscription";
    handleDeleted(subscriptionId);
    showToast({
      title: "Subscription deleted",
      description: `${deletedName || "Subscription"} was removed.`,
      tone: "success",
    });
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
        showToast({
          title: "Delete failed",
          description: data.error || "Unable to delete subscription.",
          tone: "error",
        });
        return;
      }

      handleDeleted(subscription.id);
      showToast({
        title: "Subscription deleted",
        description: `${subscription.tool || "Subscription"} was removed.`,
        tone: "success",
      });
    } catch (deleteError) {
      console.error("Failed to delete subscription:", deleteError);
      setError("A network error occurred while deleting the subscription.");
      showToast({
        title: "Delete failed",
        description: "A network error occurred while deleting.",
        tone: "error",
      });
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
        showToast({
          title: "Status not updated",
          description: data.error || "Unable to update payment status.",
          tone: "error",
        });
        return;
      }

      setSubscriptions((current) =>
        current.map((item) =>
          item.id === subscription.id ? normalizeSubscription(data) : item,
        ),
      );
      showToast({
        title: "Payment status updated",
        description:
          data.payment_status && data.payment_status !== paymentStatus
            ? `${subscription.tool || "Subscription"} advanced to the next billing cycle.`
            : `${subscription.tool || "Subscription"} is now ${paymentStatus}.`,
        tone: "success",
      });
    } catch (statusError) {
      console.error("Failed to update payment status:", statusError);
      setError("A network error occurred while updating payment status.");
      showToast({
        title: "Status not updated",
        description: "A network error occurred while updating payment status.",
        tone: "error",
      });
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

  const openLogoutConfirm = () => {
    setIsProfileMenuOpen(false);
    setIsLogoutConfirmOpen(true);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/logout", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to log out.");
        showToast({
          title: "Logout failed",
          description: data.error || "Unable to log out.",
          tone: "error",
        });
        return;
      }

      window.location.href = "/login";
    } catch (logoutError) {
      console.error("Failed to log out:", logoutError);
      setError("A network error occurred while logging out.");
      showToast({
        title: "Logout failed",
        description: "A network error occurred while logging out.",
        tone: "error",
      });
    } finally {
      setIsLoggingOut(false);
      setIsProfileMenuOpen(false);
      setIsLogoutConfirmOpen(false);
    }
  };

  const handleSendBudgetEmail = async () => {
    setIsBudgetSending(true);
    setError("");

    try {
      const response = await fetch("/api/budget/send", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to send the budget report.");
        showToast({
          title: "Budget report not sent",
          description: data.error || "Unable to send the budget report.",
          tone: "error",
        });
        return;
      }

      if ((data.emailsSent ?? 0) === 0) {
        showToast({
          title: "Budget report not sent",
          description:
            data.skipped === "disabled"
              ? "Monthly budget email is disabled in Mail Settings."
              : "Add an active recipient in Mail Settings first.",
          tone: "info",
        });
      } else {
        showToast({
          title: "Budget report sent",
          description: "Delivered the monthly budget email with its PDF attachment.",
          tone: "success",
        });
      }
    } catch (budgetError) {
      console.error("Failed to send budget report:", budgetError);
      setError("A network error occurred while sending the budget report.");
      showToast({
        title: "Budget report not sent",
        description: "A network error occurred while sending the budget report.",
        tone: "error",
      });
    } finally {
      setIsBudgetSending(false);
    }
  };

  const handleDownloadNextDue = () => {
    const generatedOn = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const lines: Array<{
      text: string;
      size?: number;
      font?: "regular" | "bold" | "mono";
    }> = [
      { text: "SubTrack Pro", size: 12, font: "bold" },
      { text: "Next Due Subscriptions", size: 20, font: "bold" },
      {
        text: `Generated on ${generatedOn}. Includes only unpaid subscriptions due from today onward.`,
        size: 11,
      },
      { text: "", size: 8 },
    ];

    if (nextDueGroups.length === 0) {
      lines.push({
        text: "No due subscriptions available right now.",
        size: 12,
      });
    } else {
      for (const group of nextDueGroups) {
        lines.push({
          text: `${group.label} (${group.items.length} due)`,
          size: 14,
          font: "bold",
        });
        lines.push({
          text: `${truncatePdfCell("Tool", 20)} ${truncatePdfCell("Plan", 18)} ${truncatePdfCell("Due Date", 14)} ${truncatePdfCell("Price", 10)} ${truncatePdfCell("Status", 10)}`,
          size: 10,
          font: "mono",
        });
        lines.push({
          text: `${"-".repeat(20)} ${"-".repeat(18)} ${"-".repeat(14)} ${"-".repeat(10)} ${"-".repeat(10)}`,
          size: 10,
          font: "mono",
        });

        for (const { subscription } of group.items) {
          lines.push({
            text: `${truncatePdfCell(subscription.tool || "-", 20)} ${truncatePdfCell(subscription.subscription || "-", 18)} ${truncatePdfCell(formatDueDate(subscription.next_due_date || subscription.due_date), 14)} ${truncatePdfCell(subscription.price || "-", 10)} ${truncatePdfCell(subscription.payment_status || "Not Paid", 10)}`,
            size: 10,
            font: "mono",
          });
        }

        lines.push({ text: "", size: 8 });
      }
    }

    const blob = buildPdfDocument(lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `subtrack-next-due-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast({
      title: "Next due list downloaded",
      description: "The due subscriptions PDF is ready to share.",
      tone: "success",
    });
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
              onClick={() => setActiveTab(item.label)}
              className={`flex w-full items-center gap-3 px-[21px] py-[9px] text-left transition-colors duration-200 ${
                item.label === activeTab
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
          <button
            type="button"
            onClick={openLogoutConfirm}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-3 px-[21px] py-[9px] text-left text-secondary transition-colors duration-200 hover:bg-error-container hover:text-error active:bg-error active:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="text-label-md">
              {isLoggingOut ? "Logging out..." : "Log Out"}
            </span>
          </button>
        </div>
      </aside>

      <main className="min-h-screen px-[13px] py-[21px] sm:px-[21px] lg:ml-[240px] lg:p-[29px]">
        <header className="mb-gutter flex flex-col gap-5 rounded-[20px] border border-white/50 bg-white/70 p-[21px] shadow-sm backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase lg:hidden">
              SubTrack Pro
            </p>
            <h2 className="mt-1 text-headline-lg-mobile font-semibold text-on-surface lg:text-headline-lg">
              {pageTitle}
            </h2>
            <p className="text-body-md text-secondary">{pageDescription}</p>
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
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-container-high bg-surface-container-low text-[11px] font-semibold text-primary transition-colors hover:bg-surface-container-high"
                aria-label="Open account menu"
              >
                AA
              </button>

              {isProfileMenuOpen ? (
                <div className="absolute top-[calc(100%+10px)] right-0 z-30 w-[220px] rounded-2xl border border-outline-variant bg-surface-container-lowest p-2 shadow-[0_18px_42px_rgba(25,28,29,0.12)]">
                  <div className="rounded-xl px-3 py-3">
                    <p className="text-label-md font-semibold text-on-surface">
                      Account
                    </p>
                    <p className="mt-1 text-label-sm text-secondary">
                      Sign out to require credentials on the next visit.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openLogoutConfirm}
                    disabled={isLoggingOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-body-md font-semibold text-error transition-colors hover:bg-error-container disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      logout
                    </span>
                    {isLoggingOut ? "Logging out..." : "Log Out"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-warning/20 bg-tertiary-fixed ui-button-pad-lg text-[11px] text-on-surface">
            {error}
          </div>
        ) : null}

        <nav className="mb-gutter flex gap-2 overflow-x-auto lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveTab(item.label)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border ui-button-pad text-label-md transition-colors ${
                item.label === activeTab
                  ? "border-primary bg-primary-fixed text-primary"
                  : "border-outline-variant bg-surface-container-lowest text-secondary"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

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

        {activeTab === "Analytics" ? (
          <section className="space-y-gutter">
            <div className="grid gap-gutter xl:grid-cols-3">
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  Previous Month
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  {formatCurrency(budgetReport.previousMonth.total)}
                </h3>
                <p className="mt-2 text-body-md text-secondary">
                  {budgetReport.previousMonth.label}
                </p>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  Current Month
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  {formatCurrency(budgetReport.currentMonth.total)}
                </h3>
                <p className="mt-2 text-body-md text-secondary">
                  {budgetReport.currentMonth.items.length} scheduled charge
                  {budgetReport.currentMonth.items.length === 1 ? "" : "s"}
                </p>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  Month-on-Month
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  {formatCurrency(budgetReport.changeAmount)}
                </h3>
                <p className="mt-2 text-body-md text-secondary">
                  {budgetChangeText}
                </p>
              </div>
            </div>

            <div className="grid gap-gutter xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-label-md tracking-wider text-secondary uppercase">
                      Six-Month Trend
                    </p>
                    <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                      Month-over-month spend analysis
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadSubscriptions()}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline-variant ui-button-pad text-label-md text-secondary transition-colors hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      refresh
                    </span>
                    Refresh
                  </button>
                </div>

                <div className="space-y-4">
                  {monthTrend.map((item) => (
                    <div key={item.key}>
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <span className="text-body-md font-semibold text-on-surface">
                          {item.label}
                        </span>
                        <span className="text-body-md text-secondary">
                          {formatCurrency(item.total)}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.max(6, (item.total / monthTrendMax) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-gutter">
                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    Spend Insight
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    {formatCurrency(averageCurrentMonthCharge)} average scheduled charge
                  </h3>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-surface-container-low ui-panel-pad">
                      <p className="text-label-md text-secondary">This month</p>
                      <p className="mt-2 text-[25px] font-semibold text-on-surface">
                        {formatCurrency(budgetReport.currentMonth.total)}
                      </p>
                    </div>
                    <div className="rounded-xl bg-surface-container-low ui-panel-pad">
                      <p className="text-label-md text-secondary">Next month</p>
                      <p className="mt-2 text-[25px] font-semibold text-on-surface">
                        {formatCurrency(nextMonthForecast.total)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    Payment Status
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    Live subscription mix
                  </h3>
                  <div className="mt-6 space-y-5">
                    {spendByStatus.map((item) => {
                      const percentage =
                        activeSubscriptions > 0
                          ? Math.round((item.value / activeSubscriptions) * 100)
                          : 0;

                      return (
                        <div key={item.label}>
                          <div className="mb-2 flex items-center justify-between text-body-md">
                            <span className="font-semibold text-on-surface">
                              {item.label}
                            </span>
                            <span className="text-secondary">
                              {item.value} subscriptions - {percentage}%
                            </span>
                          </div>
                          <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                            <div
                              className={`h-full rounded-full ${item.color}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    Upcoming Payments
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    Next due subscriptions
                  </h3>
                  <p className="mt-2 text-body-md text-secondary">
                    Global upcoming list from today onward, excluding paid subscriptions.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-label-sm text-success">
                    {nextDueCount} subscription{nextDueCount === 1 ? "" : "s"} due
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadNextDue}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline-variant ui-button-pad text-label-md text-secondary transition-colors hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      download
                    </span>
                    Download
                  </button>
                </div>
              </div>

              <div className="divide-y divide-surface-container-high">
                {isLoading ? (
                  <p className="py-8 text-center text-body-md text-secondary">
                    Loading analytics...
                  </p>
                ) : nextDueGroups.length === 0 ? (
                  <p className="py-8 text-center text-body-md text-secondary">
                    No unpaid subscriptions are due from today onward.
                  </p>
                ) : (
                  nextDueGroups.map((group) => (
                    <div key={group.label} className="py-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-title-md font-semibold text-on-surface">
                            {group.label}
                          </h4>
                          <p className="text-body-sm text-secondary">
                            {group.items.length} upcoming subscription
                            {group.items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="rounded-full bg-primary-fixed px-3 py-1 text-label-sm font-semibold text-primary">
                          {group.items.length} due
                        </span>
                      </div>

                      <div className="divide-y divide-surface-container-high">
                        {group.items.map(({ subscription: item }) => (
                          <div
                            key={item.id}
                            className="grid gap-3 py-4 md:grid-cols-[1fr_140px_120px_120px] md:items-center"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[10px] font-semibold ${getAvatarClasses(item.tool)}`}
                              >
                                {item.tool.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-body-md font-semibold text-on-surface">
                                  {item.tool}
                                </p>
                                <p className="text-label-md text-secondary">
                                  {item.subscription || "-"}
                                </p>
                              </div>
                            </div>
                            <p className="text-body-md text-on-surface-variant">
                              {formatDueDate(item.next_due_date || item.due_date)}
                            </p>
                            <p className="text-body-md font-semibold text-on-surface">
                              {item.price || "-"}
                            </p>
                            <span
                              className={`w-fit rounded-full ui-badge-pad text-label-sm font-semibold ${getStatusBadgeClasses(
                                item.payment_status || "Not Paid",
                              )}`}
                            >
                              {item.payment_status || "Not Paid"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        ) : activeTab === "Budget" ? (
          <section className="space-y-gutter">
            <div className="grid gap-gutter xl:grid-cols-3">
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  Last Month Spend
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  {formatCurrency(budgetReport.previousMonth.total)}
                </h3>
                <p className="mt-2 text-body-md text-secondary">
                  {budgetReport.previousMonth.label}
                </p>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  New Month Forecast
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  {formatCurrency(budgetReport.currentMonth.total)}
                </h3>
                <p className="mt-2 text-body-md text-secondary">
                  {budgetReport.currentMonth.label}
                </p>
              </div>

              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
                <p className="text-label-md tracking-wider text-secondary uppercase">
                  Send Monthly Report
                </p>
                <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                  First day of every month
                </h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSendBudgetEmail()}
                    disabled={isBudgetSending}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isBudgetSending ? "hourglass_top" : "send"}
                    </span>
                    {isBudgetSending ? "Sending..." : "Send Report Now"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBudgetMailSettingsOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-outline-variant ui-button-pad-lg text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      settings
                    </span>
                    Mail Settings
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest ui-card-pad">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    Budget Outlook
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    {budgetChangeText}
                  </h3>
                </div>
                <div className="rounded-full bg-primary-fixed ui-badge-pad text-label-sm font-semibold text-primary">
                  Next month forecast: {formatCurrency(nextMonthForecast.total)}
                </div>
              </div>
            </div>

            <div className="grid gap-gutter xl:grid-cols-2">
              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="border-b border-surface-container-high ui-panel-pad">
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    Closed Month
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    What was spent in {budgetReport.previousMonth.label}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-container-low">
                        {["Tool", "Plan", "Due Date", "Price"].map((heading) => (
                          <th
                            key={heading}
                            className="ui-table-cell text-label-md tracking-wider text-secondary uppercase"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container-high">
                      {budgetReport.previousMonth.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="ui-table-empty text-center text-secondary">
                            No subscription charges were tracked for this month.
                          </td>
                        </tr>
                      ) : (
                        budgetReport.previousMonth.items.map((item) => (
                          <tr key={`${budgetReport.previousMonth.key}-${item.id}`}>
                            <td className="ui-table-cell text-body-md font-semibold text-on-surface">
                              {item.tool}
                            </td>
                            <td className="ui-table-cell text-body-md text-on-surface-variant">
                              {item.subscription || "-"}
                            </td>
                            <td className="ui-table-cell text-body-md text-on-surface-variant">
                              {formatDueDate(item.dueDate)}
                            </td>
                            <td className="ui-table-cell text-body-md font-semibold text-on-surface">
                              {item.price || formatCurrency(item.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                <div className="border-b border-surface-container-high ui-panel-pad">
                  <p className="text-label-md tracking-wider text-secondary uppercase">
                    New Month
                  </p>
                  <h3 className="mt-1 text-title-lg font-semibold text-on-surface">
                    What is scheduled for {budgetReport.currentMonth.label}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-container-low">
                        {["Tool", "Plan", "Due Date", "Price"].map((heading) => (
                          <th
                            key={heading}
                            className="ui-table-cell text-label-md tracking-wider text-secondary uppercase"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container-high">
                      {budgetReport.currentMonth.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="ui-table-empty text-center text-secondary">
                            No subscription charges are scheduled for this month.
                          </td>
                        </tr>
                      ) : (
                        budgetReport.currentMonth.items.map((item) => (
                          <tr key={`${budgetReport.currentMonth.key}-${item.id}`}>
                            <td className="ui-table-cell text-body-md font-semibold text-on-surface">
                              {item.tool}
                            </td>
                            <td className="ui-table-cell text-body-md text-on-surface-variant">
                              {item.subscription || "-"}
                            </td>
                            <td className="ui-table-cell text-body-md text-on-surface-variant">
                              {formatDueDate(item.dueDate)}
                            </td>
                            <td className="ui-table-cell text-body-md font-semibold text-on-surface">
                              {item.price || formatCurrency(item.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
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
                        {item.action === "FREE" || item.subscription === "Free" ? (
                          <span className="inline-flex rounded-full bg-primary-fixed ui-badge-pad text-label-sm font-semibold text-primary">
                            Free
                          </span>
                        ) : (
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
                        )}
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
          </>
        )}
      </main>

      <SubscriptionModal
        key={`${modalMode}-${selectedSubscription?.id ?? "new"}-${isModalOpen ? "open" : "closed"}`}
        isOpen={isModalOpen}
        mode={modalMode}
        subscription={selectedSubscription}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleSaved}
        onDeleted={handleModalDeleted}
        onNotify={showToast}
      />

      <ReminderSettingsModal
        isOpen={isReminderSettingsOpen}
        onClose={() => setIsReminderSettingsOpen(false)}
        onNotify={showToast}
      />
      <BudgetMailSettingsModal
        isOpen={isBudgetMailSettingsOpen}
        onClose={() => setIsBudgetMailSettingsOpen(false)}
        onNotify={showToast}
      />
      {isLogoutConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-inverse-surface/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[20px] border border-outline-variant bg-surface-container-lowest p-[21px] shadow-2xl">
            <p className="text-label-md font-medium tracking-[0.18em] text-error uppercase">
              Confirm Logout
            </p>
            <h3 className="mt-2 text-[25px] font-semibold text-on-surface">
              Log out of SubTrack Pro?
            </h3>
            <p className="mt-3 text-body-md text-on-surface-variant">
              Your current session will end immediately, and you’ll need to enter
              your credentials again to sign back in.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(false)}
                disabled={isLoggingOut}
                className="rounded-xl border border-outline-variant ui-button-pad-lg text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="rounded-xl bg-error px-[21px] py-[11px] text-label-md font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "Logging out..." : "Yes, Log Out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ToastViewport messages={toasts} onDismiss={dismissToast} />
    </>
  );
}
