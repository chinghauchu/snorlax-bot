// SPDX-License-Identifier: Apache-2.0

export type PluginRow = {
  id: string;
  name: string;
  status: "connected" | "needsAuth" | string;
};

export type ConnectCardBody = {
  prompt: string;
  pluginId: string;
  helpText?: string | null;
};

export type ConnectStatus = "pending" | "connected" | "dismissed" | string;

export function isConnect(message: {
  kind?: string;
  connect?: ConnectCardBody | null;
}): boolean {
  return message.kind === "connect" || Boolean(message.connect);
}

export function connectOf(message: {
  connect?: ConnectCardBody | null;
}): ConnectCardBody | null {
  const raw = message.connect;
  if (!raw || typeof raw !== "object") return null;
  if (!raw.prompt || !raw.pluginId) return null;
  return raw;
}

export function connectStatusOf(message: {
  connectStatus?: ConnectStatus | null;
}): ConnectStatus {
  return message.connectStatus || "pending";
}

export function isPendingConnect(message: {
  kind?: string;
  connect?: ConnectCardBody | null;
  connectStatus?: ConnectStatus | null;
}): boolean {
  if (!isConnect(message) || !connectOf(message)) return false;
  return connectStatusOf(message) === "pending";
}

export function pluginStatusLabel(status: string): string {
  return status === "connected" ? "Connected" : "Needs sign-in";
}

export function resolvedConnectLabel(status: ConnectStatus): string | null {
  if (status === "connected") return "Connected";
  if (status === "dismissed") return "Dismissed";
  return null;
}
