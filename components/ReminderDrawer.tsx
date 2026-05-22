"use client";

import { useEffect, useState } from "react";
import type { ReminderSettings } from "@/lib/subscription-types";

interface ReminderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: ReminderSettings) => void;
}

export default function ReminderDrawer({
  isOpen,
  onClose,
  onSave,
}: ReminderDrawerProps) {
  const [email, setEmail] = useState("");
  const [daysBefore, setDaysBefore] = useState(3);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/reminder-settings");
        if (res.ok) {
          const data = await res.json();
          setEmail(data.email || "");
          setDaysBefore(data.days_before ?? 3);
          setEnabled(data.enabled ?? true);
        }
      } catch (err) {
        console.error("Failed to load reminder settings:", err);
      } finally {
        setLoading(false);
      }
    };

    void fetchSettings();
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch("/api/reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          days_before: daysBefore,
          enabled,
        }),
      });

      if (res.ok) {
        const savedData = await res.json();
        onSave?.(savedData);
        onClose();
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to save settings");
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("An error occurred while saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] overflow-hidden transition-all duration-300 ${
        isOpen ? "visible" : "invisible pointer-events-none"
      }`}
      id="settingsDrawer"
    >
      <div
        className={`absolute inset-0 bg-inverse-surface/20 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      <div
        className={`absolute top-0 right-0 flex h-full w-[400px] max-w-full flex-col border-l border-outline-variant bg-surface-container-lowest p-[29px] shadow-xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="mb-[29px] flex items-center justify-between">
          <h3 className="text-title-lg font-title-lg font-semibold text-on-surface">
            Reminder Settings
          </h3>
          <button
            className="cursor-pointer text-secondary transition-colors hover:text-on-surface"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-secondary">
            <span className="material-symbols-outlined animate-spin text-[27px]">
              refresh
            </span>
            <p className="text-body-md font-body-md">Loading settings...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-1 flex-col">
            <div className="flex-1 space-y-[21px]">
              <div>
                <label className="mb-2 block text-label-md font-label-md font-bold text-on-surface">
                  Send reminders to email
                </label>
                <input
                  className="text-body-md font-body-md h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                  placeholder="one@email.com, two@email.com"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="mt-2 text-label-sm text-secondary">
                  Separate multiple recipients with commas.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-label-md font-label-md font-bold text-on-surface">
                  Remind me X days before due date
                </label>
                <input
                  className="text-body-md font-body-md h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                  type="number"
                  min="1"
                  max="90"
                  required
                  value={daysBefore}
                  onChange={(e) => setDaysBefore(parseInt(e.target.value, 10) || 0)}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest ui-panel-pad">
                <div>
                  <p className="text-label-md font-label-md font-bold text-on-surface">
                    Enable email reminders
                  </p>
                  <p className="text-body-md font-body-md text-secondary">
                    Receive alerts before bills are due
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center select-none">
                  <input
                    className="peer sr-only"
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <div className="peer h-6 w-11 rounded-full bg-surface-container-high peer-checked:bg-[#6366f1] peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:top-[2px] after:start-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-['']" />
                </label>
              </div>
            </div>

            <div className="mt-auto border-t border-surface-container-high bg-surface-container-lowest pt-[21px]">
              <button
                type="submit"
                disabled={saving}
                className="text-label-md font-label-md flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#6366f1] ui-button-pad-lg text-white transition-all hover:bg-opacity-90"
              >
                {saving ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[20px]">
                      refresh
                    </span>
                    Saving Settings...
                  </>
                ) : (
                  "Save Settings"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
