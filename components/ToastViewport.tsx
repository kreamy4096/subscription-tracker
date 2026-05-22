"use client";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone?: "success" | "error" | "info";
}

interface ToastViewportProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

function getToneClasses(tone: ToastMessage["tone"]) {
  switch (tone) {
    case "error":
      return {
        icon: "error",
        accent: "bg-error-container text-error",
        border: "border-error/20",
      };
    case "success":
      return {
        icon: "check_circle",
        accent: "bg-success/10 text-success",
        border: "border-success/20",
      };
    default:
      return {
        icon: "notifications",
        accent: "bg-primary-fixed text-primary",
        border: "border-primary/20",
      };
  }
}

export default function ToastViewport({
  messages,
  onDismiss,
}: ToastViewportProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-[90] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {messages.map((message) => {
        const tone = getToneClasses(message.tone);
        return (
          <div
            key={message.id}
            className={`toast-slide-in flex items-start gap-3 rounded-xl border ${tone.border} bg-surface-container-lowest px-[13px] py-[11px] shadow-[0_18px_42px_rgba(25,28,29,0.14)]`}
          >
            <span
              className={`material-symbols-outlined rounded-lg p-1 text-[16px] ${tone.accent}`}
            >
              {tone.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-md font-semibold text-on-surface">
                {message.title}
              </p>
              {message.description ? (
                <p className="mt-1 text-body-md text-secondary">
                  {message.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(message.id)}
              className="rounded-full p-1 text-secondary transition-colors hover:bg-surface-container-high hover:text-on-surface"
              aria-label="Dismiss notification"
            >
              <span className="material-symbols-outlined text-[14px]">
                close
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
