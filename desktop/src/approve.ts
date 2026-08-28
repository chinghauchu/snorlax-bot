// SPDX-License-Identifier: Apache-2.0

export type ApproveCardBody = {
  command: string;
};

export type ApproveStatus = "pending" | "approved" | "denied" | string;

export function isApprove(message: {
  kind?: string;
  approve?: ApproveCardBody | null;
}): boolean {
  return message.kind === "approve" || Boolean(message.approve);
}

export function approveOf(message: {
  approve?: ApproveCardBody | null;
}): ApproveCardBody | null {
  const raw = message.approve;
  if (!raw || typeof raw !== "object") return null;
  if (!raw.command) return null;
  return raw;
}

export function approveStatusOf(message: {
  approveStatus?: ApproveStatus | null;
}): ApproveStatus {
  return message.approveStatus || "pending";
}

export function isPendingApprove(message: {
  kind?: string;
  approve?: ApproveCardBody | null;
  approveStatus?: ApproveStatus | null;
}): boolean {
  if (!isApprove(message) || !approveOf(message)) return false;
  return approveStatusOf(message) === "pending";
}

export function resolvedApproveLabel(status: ApproveStatus): string | null {
  if (status === "denied") return "Denied";
  return null;
}
