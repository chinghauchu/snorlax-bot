// SPDX-License-Identifier: Apache-2.0
import { approveStatusOf, resolvedApproveLabel, type ApproveCardBody } from "./approve";

type Props = {
  messageId: string;
  card: ApproveCardBody;
  status?: string | null;
  disabled?: boolean;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
};

export function ApproveCard({
  messageId,
  card,
  status,
  disabled = false,
  onApprove,
  onDeny,
}: Props) {
  const pending = (status || "pending") === "pending";
  const interactive = pending && !disabled;
  const denied = resolvedApproveLabel(approveStatusOf({ approveStatus: status }));

  return (
    <div className={`approve-card${status === "denied" ? " denied" : ""}`}>
      {interactive ? (
        <button
          type="button"
          className="approve-dismiss"
          aria-label="Deny"
          onClick={() => onDeny(messageId)}
        >
          ×
        </button>
      ) : null}
      <pre className="approve-command" title={card.command}>
        {card.command}
      </pre>
      {denied ? <p className="approve-denied-label">{denied}</p> : null}
      {interactive ? (
        <div className="approve-actions">
          <button
            type="button"
            className="approve-approve"
            onClick={() => onApprove(messageId)}
          >
            Approve
          </button>
          <button
            type="button"
            className="approve-deny"
            onClick={() => onDeny(messageId)}
          >
            Deny
          </button>
        </div>
      ) : null}
    </div>
  );
}
