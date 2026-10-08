export const TICKET_TYPES = ["bug", "feature", "support"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];

// Note: the en dash in "Done – awaiting confirmation" matches the spec and the database check.
export const STATUSES = [
  "New",
  "Viable check",
  "Not viable",
  "In progress",
  "Blocked",
  "Done – awaiting confirmation",
  "Closed",
  "Reopened",
] as const;
export type Status = (typeof STATUSES)[number];

export const TYPE_LABEL: Record<TicketType, string> = {
  bug: "Bug",
  feature: "Feature request",
  support: "Support issue",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "Critical",
  P1: "High",
  P2: "Medium",
  P3: "Low",
};

export const PRIORITY_HINT: Record<Priority, string> = {
  P0: "Work is stopped for many people",
  P1: "A key task is broken, no workaround",
  P2: "Something is wrong, there is a workaround",
  P3: "Small issue or nice to have",
};

export const OPEN_STATUSES: readonly Status[] = [
  "New",
  "Viable check",
  "In progress",
  "Blocked",
  "Done – awaiting confirmation",
  "Reopened",
];
