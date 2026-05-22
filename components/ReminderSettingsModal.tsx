"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ReminderGroup,
  ReminderRecipient,
  ReminderSettings,
} from "@/lib/subscription-types";

interface ReminderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: ReminderSettings) => void;
}

type RecipientDraft = Pick<
  ReminderRecipient,
  "email" | "is_primary" | "is_active" | "sort_order"
> & {
  id: string;
};

type GroupDraft = Pick<
  ReminderGroup,
  "name" | "days_before" | "enabled"
> & {
  id: string;
  recipients: RecipientDraft[];
};

function makeDraftId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function normalizeRecipients(recipients: ReminderRecipient[] = []) {
  const sorted = [...recipients].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return ensurePrimary(
    sorted.map((recipient, index) => ({
      id: recipient.id || makeDraftId("recipient"),
      email: recipient.email,
      is_primary: recipient.is_primary,
      is_active: recipient.is_active !== false,
      sort_order: recipient.sort_order ?? index,
    })),
  );
}

function normalizeGroups(data: ReminderSettings & { groups?: ReminderGroup[] }) {
  if (data.groups && data.groups.length > 0) {
    return data.groups.map((group, index) => ({
      id: group.id || makeDraftId("group"),
      name: group.name || `Group ${index + 1}`,
      days_before: group.days_before ?? data.days_before ?? 3,
      enabled: group.enabled ?? data.enabled ?? true,
      recipients: normalizeRecipients(group.recipients),
    }));
  }

  const recipients = (data.recipients && data.recipients.length > 0
    ? data.recipients
    : data.email
        .split(",")
        .map((email, index) => ({
          id: makeDraftId("recipient"),
          email: email.trim(),
          is_primary: index === 0,
          is_active: true,
          sort_order: index,
        }))
        .filter((item) => item.email)) as ReminderRecipient[];

  return [
    {
      id: makeDraftId("group"),
      name: "Default",
      days_before: data.days_before ?? 3,
      enabled: data.enabled ?? true,
      recipients: normalizeRecipients(recipients),
    },
  ];
}

function ensurePrimary(recipients: RecipientDraft[]) {
  const activeRecipients = recipients.filter((recipient) => recipient.is_active);
  const firstActiveIndex = recipients.findIndex((recipient) => recipient.is_active);
  const primaryIndex = recipients.findIndex(
    (recipient) => recipient.is_primary && recipient.is_active,
  );

  return recipients.map((recipient, index) => ({
    ...recipient,
    sort_order: index,
    is_primary:
      recipient.is_active &&
      activeRecipients.length > 0 &&
      (primaryIndex === -1 ? index === firstActiveIndex : index === primaryIndex),
  }));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function ReminderSettingsModal({
  isOpen,
  onClose,
  onSave,
}: ReminderSettingsModalProps) {
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addAsPrimary, setAddAsPrimary] = useState(false);
  const [draggedRecipientId, setDraggedRecipientId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || groups[0],
    [activeGroupId, groups],
  );
  const primaryEmail =
    activeGroup?.recipients.find((recipient) => recipient.is_primary)?.email || "";

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const fetchSettings = async () => {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/reminder-settings");
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Unable to load reminder settings.");
          return;
        }

        const normalizedGroups = normalizeGroups(data);
        setGroups(normalizedGroups);
        setActiveGroupId(normalizedGroups[0]?.id || "");
        setNewEmail("");
        setAddAsPrimary(false);
      } catch (err) {
        console.error("Failed to load reminder settings:", err);
        setError("A network error occurred while loading settings.");
      } finally {
        setLoading(false);
      }
    };

    void fetchSettings();
  }, [isOpen]);

  const updateActiveGroup = (updater: (group: GroupDraft) => GroupDraft) => {
    setGroups((current) =>
      current.map((group) =>
        group.id === activeGroup?.id ? updater(group) : group,
      ),
    );
  };

  const handleAddGroup = () => {
    const nextGroup = {
      id: makeDraftId("group"),
      name: `Group ${groups.length + 1}`,
      days_before: 3,
      enabled: true,
      recipients: [],
    };
    setGroups((current) => [...current, nextGroup]);
    setActiveGroupId(nextGroup.id);
    setError("");
  };

  const handleDeleteGroup = () => {
    if (!activeGroup || groups.length <= 1) {
      return;
    }

    const nextGroups = groups.filter((group) => group.id !== activeGroup.id);
    setGroups(nextGroups);
    setActiveGroupId(nextGroups[0]?.id || "");
  };

  const handleAddRecipient = () => {
    if (!activeGroup) {
      return;
    }

    const email = newEmail.trim().toLowerCase();
    if (!email) {
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (
      activeGroup.recipients.some(
        (recipient) => recipient.email.toLowerCase() === email,
      )
    ) {
      setError("That email is already in this group.");
      return;
    }

    updateActiveGroup((group) => {
      const recipients = addAsPrimary
        ? group.recipients.map((recipient) => ({
            ...recipient,
            is_primary: false,
          }))
        : group.recipients;

      return {
        ...group,
        recipients: ensurePrimary([
          ...recipients,
          {
            id: makeDraftId("recipient"),
            email,
            is_primary: addAsPrimary || recipients.every((item) => !item.is_active),
            is_active: true,
            sort_order: recipients.length,
          },
        ]),
      };
    });

    setNewEmail("");
    setAddAsPrimary(false);
    setError("");
  };

  const handleHardDeleteRecipient = (id: string) => {
    updateActiveGroup((group) => ({
      ...group,
      recipients: ensurePrimary(
        group.recipients.filter((recipient) => recipient.id !== id),
      ),
    }));
  };

  const handleToggleActive = (id: string) => {
    updateActiveGroup((group) => ({
      ...group,
      recipients: ensurePrimary(
        group.recipients.map((recipient) =>
          recipient.id === id
            ? {
                ...recipient,
                is_active: !recipient.is_active,
                is_primary: recipient.is_active ? false : recipient.is_primary,
              }
            : recipient,
        ),
      ),
    }));
  };

  const handleSetPrimary = (id: string) => {
    updateActiveGroup((group) => ({
      ...group,
      recipients: group.recipients.map((recipient) => ({
        ...recipient,
        is_active:
          recipient.id === id ? true : recipient.is_active,
        is_primary: recipient.id === id,
      })),
    }));
  };

  const handleDropRecipient = (targetId: string) => {
    if (!draggedRecipientId || !activeGroup) {
      return;
    }

    const fromIndex = activeGroup.recipients.findIndex(
      (recipient) => recipient.id === draggedRecipientId,
    );
    const toIndex = activeGroup.recipients.findIndex(
      (recipient) => recipient.id === targetId,
    );

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      setDraggedRecipientId(null);
      return;
    }

    updateActiveGroup((group) => ({
      ...group,
      recipients: ensurePrimary(moveItem(group.recipients, fromIndex, toIndex)),
    }));
    setDraggedRecipientId(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/reminder-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save reminder settings.");
        return;
      }

      onSave?.(data);
      onClose();
    } catch (err) {
      console.error("Failed to save reminder settings:", err);
      setError("A network error occurred while saving settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[60] transition-all duration-300 ${
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
        className={`absolute top-1/2 left-1/2 flex max-h-[calc(100svh-2rem)] w-[min(880px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-2xl transition-all duration-300 ${
          isOpen
            ? "visible translate-y-[-50%] opacity-100"
            : "invisible translate-y-[-46%] opacity-0"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-surface-container-high px-[29px] py-[21px]">
          <div>
            <p className="text-label-md font-medium tracking-[0.18em] text-secondary uppercase">
              Email Reminders
            </p>
            <h2 className="mt-2 text-[25px] font-semibold text-on-surface">
              Reminder Settings
            </h2>
            <p className="mt-2 max-w-xl text-body-md text-on-surface-variant">
              Manage groups, primary recipients, CC order, and active status.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-secondary transition-colors hover:bg-surface-container-low hover:text-on-surface"
            aria-label="Close reminder settings"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="min-h-0 overflow-y-auto px-[29px] py-[21px]"
        >
          {loading ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-secondary">
              <span className="material-symbols-outlined animate-spin text-[27px]">
                refresh
              </span>
              <p className="text-body-md">Loading settings...</p>
            </div>
          ) : (
            <>
              <div className="grid gap-[21px] lg:grid-cols-[220px_1fr]">
                <aside className="rounded-xl border border-outline-variant bg-surface-container-low ui-panel-pad">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-label-md font-semibold text-on-surface">
                      Groups
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddGroup}
                      className="rounded-full p-1 text-primary transition-colors hover:bg-primary-fixed"
                      aria-label="Add reminder group"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        add
                      </span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveGroupId(group.id)}
                        className={`w-full rounded-lg border px-[11px] py-[9px] text-left transition-colors ${
                          group.id === activeGroup?.id
                            ? "border-primary bg-primary-fixed text-primary"
                            : "border-outline-variant bg-surface-container-lowest text-secondary hover:bg-surface-container-high"
                        }`}
                      >
                        <span className="block truncate text-label-md font-semibold">
                          {group.name}
                        </span>
                        <span className="text-label-sm">
                          {group.recipients.filter((item) => item.is_active).length} active
                        </span>
                      </button>
                    ))}
                  </div>
                </aside>

                {activeGroup ? (
                  <section>
                    <div className="grid gap-[13px] sm:grid-cols-[1fr_160px_120px]">
                      <label className="block">
                        <span className="mb-2 block text-label-md font-semibold text-on-surface">
                          Group name
                        </span>
                        <input
                          className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                          value={activeGroup.name}
                          onChange={(event) =>
                            updateActiveGroup((group) => ({
                              ...group,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-label-md font-semibold text-on-surface">
                          Days before
                        </span>
                        <input
                          className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                          type="number"
                          min="1"
                          max="90"
                          required
                          value={activeGroup.days_before}
                          onChange={(event) =>
                            updateActiveGroup((group) => ({
                              ...group,
                              days_before: parseInt(event.target.value, 10) || 0,
                            }))
                          }
                        />
                      </label>

                      <div>
                        <span className="mb-2 block text-label-md font-semibold text-on-surface">
                          Enabled
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveGroup((group) => ({
                              ...group,
                              enabled: !group.enabled,
                            }))
                          }
                          className={`h-11 w-full rounded-lg border text-label-md font-semibold transition-colors ${
                            activeGroup.enabled
                              ? "border-primary bg-primary text-on-primary"
                              : "border-outline-variant text-secondary hover:bg-surface-container-low"
                          }`}
                        >
                          {activeGroup.enabled ? "On" : "Off"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-[13px] flex items-center justify-between">
                      {primaryEmail ? (
                        <span className="rounded-full bg-primary-fixed ui-badge-pad text-label-sm font-semibold text-primary">
                          To: {primaryEmail}
                        </span>
                      ) : (
                        <span className="text-label-sm text-secondary">
                          Add an active primary email.
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleDeleteGroup}
                        disabled={groups.length <= 1}
                        className="inline-flex items-center gap-1 rounded-full border border-error/25 ui-badge-pad text-label-sm font-semibold text-error transition-colors hover:bg-error-container disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          delete
                        </span>
                        Delete group
                      </button>
                    </div>

                    <div className="mt-[13px] overflow-hidden rounded-xl border border-outline-variant">
                      {activeGroup.recipients.length === 0 ? (
                        <div className="bg-surface-container-lowest p-[21px] text-center text-body-md text-secondary">
                          No reminder emails have been added.
                        </div>
                      ) : (
                        activeGroup.recipients.map((recipient) => (
                          <div
                            key={recipient.id}
                            draggable
                            onDragStart={() => setDraggedRecipientId(recipient.id)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => handleDropRecipient(recipient.id)}
                            className={`flex items-center gap-3 border-b border-surface-container-high bg-surface-container-lowest px-[13px] py-[11px] last:border-b-0 ${
                              draggedRecipientId === recipient.id ? "opacity-50" : ""
                            }`}
                          >
                            <span className="material-symbols-outlined cursor-grab text-[18px] text-secondary">
                              drag_indicator
                            </span>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-label-md font-semibold text-on-secondary-container">
                              {recipient.email.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-body-md font-semibold text-on-surface">
                                {recipient.email}
                              </p>
                              <p className="text-label-sm text-secondary">
                                {recipient.is_active
                                  ? recipient.is_primary
                                    ? "Primary recipient"
                                    : "Copied on reminders"
                                  : "Inactive"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(recipient.id)}
                              className={`rounded-full border ui-badge-pad text-label-sm font-semibold transition-colors ${
                                recipient.is_active
                                  ? "border-success bg-success/10 text-success"
                                  : "border-outline-variant text-secondary hover:bg-surface-container-low"
                              }`}
                            >
                              {recipient.is_active ? "Active" : "Inactive"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(recipient.id)}
                              className={`rounded-full border ui-badge-pad text-label-sm font-semibold transition-colors ${
                                recipient.is_primary
                                  ? "border-primary bg-primary text-on-primary"
                                  : "border-outline-variant text-secondary hover:bg-surface-container-low"
                              }`}
                            >
                              Primary
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHardDeleteRecipient(recipient.id)}
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
                          Add email
                        </span>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            className="h-11 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-lowest ui-control-pad text-body-md outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary"
                            type="email"
                            placeholder="finance@company.com"
                            value={newEmail}
                            onChange={(event) => setNewEmail(event.target.value)}
                          />
                          <button
                            type="button"
                            onClick={handleAddRecipient}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              add
                            </span>
                            Add
                          </button>
                        </div>
                      </label>
                      <label className="mt-3 inline-flex items-center gap-2 text-body-md text-on-surface">
                        <input
                          type="checkbox"
                          checked={addAsPrimary}
                          onChange={(event) =>
                            setAddAsPrimary(event.target.checked)
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        Add as primary recipient
                      </label>
                    </div>
                  </section>
                ) : null}
              </div>

              {error ? (
                <div className="mt-[13px] rounded-lg border border-error/20 bg-error-container ui-button-pad text-body-md text-error">
                  {error}
                </div>
              ) : null}

              <div className="sticky bottom-0 -mx-[29px] mt-8 flex flex-col gap-3 border-t border-surface-container-high bg-surface-container-lowest px-[29px] pt-5 pb-[21px] sm:flex-row sm:items-center sm:justify-between">
                <p className="text-body-md text-secondary">
                  Drag emails to set CC order. Inactive emails are never sent.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-outline-variant ui-button-pad-lg text-label-md font-semibold text-secondary transition-colors hover:bg-surface-container-low"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary ui-button-pad-lg text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
