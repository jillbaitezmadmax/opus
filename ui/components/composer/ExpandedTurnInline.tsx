import React, { useEffect, useMemo, useState } from "react";
import type { ChatTurn, ResponseBlock } from "../../types/chat";

interface ExpandedTurnInlineProps {
  turn: ChatTurn | null;
  onClose: () => void;
}

const getProviderColor = (providerId: string): string => {
  const colors: Record<string, string> = {
    openai: "#10a37f",
    anthropic: "#8b5cf6",
    claude: "#8b5cf6",
    google: "#4285f4",
    xai: "#ff6b35",
  };
  return colors[providerId.replace("-synthesis", "").replace("-mapping", "")] || "#6b7280";
};

const groupResponses = (turn: ChatTurn | null) => {
  if (!turn || turn.type !== "ai") {
    return { synthesis: [] as ResponseBlock[], mapping: [] as ResponseBlock[], batch: [] as ResponseBlock[] };
  }

  const synthesis: ResponseBlock[] = [];
  const mapping: ResponseBlock[] = [];
  const batch: ResponseBlock[] = [];

  turn.responses.forEach((resp) => {
    const providerId = resp.providerId || "";
    if (providerId.includes("-synthesis")) {
      synthesis.push(resp);
    } else if (providerId.includes("-mapping")) {
      mapping.push(resp);
    } else {
      batch.push(resp);
    }
  });

  return { synthesis, mapping, batch };
};

const ExpandedTurnInline: React.FC<ExpandedTurnInlineProps> = ({ turn, onClose }) => {
  const { synthesis, mapping, batch } = useMemo(() => groupResponses(turn), [turn]);
  const [selectedResponseId, setSelectedResponseId] = useState<string>("");

  useEffect(() => {
    if (!turn) {
      setSelectedResponseId("");
      return;
    }

    if (turn.type === "ai") {
      const primary = batch[0] || synthesis[0] || mapping[0] || turn.responses[0];
      setSelectedResponseId(primary?.id || "");
    } else {
      setSelectedResponseId("");
    }
  }, [turn, batch, synthesis, mapping]);

  if (!turn) {
    return (
      <div
        style={{
          height: "100%",
          background: "#0f172a",
          borderRight: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontSize: 14,
        }}
      >
        Hover or double-click a turn to see the expanded view.
      </div>
    );
  }

  const activeResponse = selectedResponseId
    ? turn.responses.find((resp) => resp.id === selectedResponseId)
    : undefined;

  const expandedText = turn.type === "user" ? turn.content : activeResponse?.content || turn.content;

  return (
    <div
      style={{
        height: "100%",
        background: "#0f172a",
        borderRight: "1px solid #334155",
        display: "flex",
        flexDirection: "column",
        minWidth: 420,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: turn.type === "user" ? "#3b82f6" : getProviderColor(turn.providerId || "default"),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            {turn.type === "user" ? "" : ""}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0" }}>
              {turn.type === "user" ? "User Prompt" : turn.providerId || "AI Response"}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{new Date(turn.timestamp).toLocaleString()}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "1px solid #475569",
            color: "#94a3b8",
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {turn.type === "ai" && turn.responses.length > 1 && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #334155",
            display: "flex",
            gap: 8,
            overflowX: "auto",
          }}
        >
          {turn.responses.map((resp) => (
            <button
              key={resp.id}
              onClick={() => setSelectedResponseId(resp.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: `1px solid ${selectedResponseId === resp.id ? "#8b5cf6" : "#334155"}`,
                background: selectedResponseId === resp.id ? "rgba(139, 92, 246, 0.2)" : "#1e293b",
                color: "#e2e8f0",
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {resp.providerId}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid #334155",
          }}
        >
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Synthesis</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
              {synthesis[0]?.content || ""}
            </div>
          </div>
          <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>Ensemble</div>
            <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
              {mapping[0]?.content || ""}
            </div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 16,
            color: "#e2e8f0",
            lineHeight: 1.6,
            fontSize: 14,
          }}
        >
          {expandedText || "No content available."}
        </div>

        {batch.length > 0 && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #334155" }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Batch Responses</div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto" }}>
              {batch.map((resp) => (
                <div
                  key={resp.id}
                  style={{
                    minWidth: 160,
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{resp.providerId}</div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>
                    {resp.content || ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpandedTurnInline;
