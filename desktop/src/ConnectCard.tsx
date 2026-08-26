// SPDX-License-Identifier: Apache-2.0
import {
  connectStatusOf,
  resolvedConnectLabel,
  type ConnectCardBody,
} from "./connect";

type Props = {
  messageId: string;
  card: ConnectCardBody;
  status?: string | null;
  disabled?: boolean;
  onConnect: (id: string, pluginId: string) => void;
  onDismiss: (id: string) => void;
};

export function ConnectCard({
  messageId,
  card,
  status,
  disabled = false,
  onConnect,
  onDismiss,
}: Props) {
  const pending = (status || "pending") === "pending";
  const interactive = pending && !disabled;
  const resolved = resolvedConnectLabel(connectStatusOf({ connectStatus: status }));

  return (
    <div className={`connect-card${status === "dismissed" ? " dismissed" : ""}`}>
      {interactive ? (
        <button
          type="button"
          className="connect-dismiss"
          aria-label="Dismiss"
          onClick={() => onDismiss(messageId)}
        >
          ×
        </button>
      ) : null}
      <p className="connect-prompt">{card.prompt}</p>
      {card.helpText ? <p className="connect-help">{card.helpText}</p> : null}
      {resolved ? <p className="connect-status">{resolved}</p> : null}
      {interactive ? (
        <button
          type="button"
          className="connect-primary"
          onClick={() => onConnect(messageId, card.pluginId)}
        >
          Connect
        </button>
      ) : null}
    </div>
  );
}
