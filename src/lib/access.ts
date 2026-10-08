export const ROLES = ["reporter", "developer", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export type Actor = { id: string; role: Role; isActive: boolean };
export type TicketRef = { reporterId: string | null; deletedAt: string | null };

export function isStaff(role: Role): boolean {
  return role === "developer" || role === "manager" || role === "admin";
}

/** Mirrors the row-level security policy on support_tickets. */
export function canViewTicket(actor: Actor, ticket: TicketRef): boolean {
  if (!actor.isActive || ticket.deletedAt) return false;
  if (isStaff(actor.role)) return true;
  return ticket.reporterId !== null && ticket.reporterId === actor.id;
}

export function canSeeInternalComments(actor: Actor): boolean {
  return actor.isActive && isStaff(actor.role);
}

/** Developers and admins change tickets; managers are read-only. */
export function canChangeTicket(actor: Actor): boolean {
  return actor.isActive && (actor.role === "developer" || actor.role === "admin");
}

export function canManageMaster(actor: Actor): boolean {
  return actor.isActive && actor.role === "admin";
}

export function canChangeRoles(actor: Actor): boolean {
  return canManageMaster(actor);
}
