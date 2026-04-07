"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
  dateAdded: string;
};

type Opportunity = {
  id: string;
  name: string;
  status: string;
  stage: string;
  monetaryValue: number;
  contactName: string;
};

type Conversation = {
  id: string;
  contactName: string;
  lastMessage: string;
  lastMessageType: string;
  lastMessageDate: string;
  unreadCount: number;
};

type CRMView = "contacts" | "pipeline" | "conversations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type CRMPanelProps = {
  refreshKey?: number;
};

export function CRMPanel({ refreshKey = 0 }: CRMPanelProps) {
  const [view, setView] = useState<CRMView>("contacts");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const searchRef = useRef(searchQuery);
  searchRef.current = searchQuery;

  const fetchData = useCallback(async (activeView: CRMView) => {
    setLoading(true);
    setError(null);
    try {
      if (activeView === "contacts") {
        const q = searchRef.current;
        const params = q ? `?query=${encodeURIComponent(q)}` : "";
        const resp = await fetch(`${API_BASE}/api/crm/contacts${params}`);
        if (!resp.ok) throw new Error(`${resp.status}`);
        const data = await resp.json();
        setContacts(data.contacts || []);
      } else if (activeView === "pipeline") {
        const resp = await fetch(`${API_BASE}/api/crm/opportunities`);
        if (!resp.ok) throw new Error(`${resp.status}`);
        const data = await resp.json();
        setOpportunities(data.opportunities || []);
      } else {
        const resp = await fetch(`${API_BASE}/api/crm/conversations`);
        if (!resp.ok) throw new Error(`${resp.status}`);
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      const status = (e as Error).message;
      if (status === "503") {
        setError("CRM features require GoHighLevel credentials. Add GHL_API_KEY and GHL_LOCATION_ID to your .env file.");
      } else {
        setError("Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(view);
  }, [view, fetchData, refreshKey]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData("contacts");
  };

  const viewButtons: { id: CRMView; label: string }[] = [
    { id: "contacts", label: "Contacts" },
    { id: "pipeline", label: "Pipeline" },
    { id: "conversations", label: "Messages" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {viewButtons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => setView(btn.id)}
            className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 relative ${
              view === btn.id
                ? "text-accent-bright"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
            style={{ fontWeight: 510 }}
          >
            {btn.label}
            {view === btn.id && (
              <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-accent-default/60" />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => fetchData(view)}
          className="ml-auto px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 hover:bg-white/5 text-text-tertiary"
          aria-label="Refresh"
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      {view === "contacts" && (
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts..."
            className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none bg-surface-1 border border-white/[0.06] text-text-primary/80"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-[10px] font-medium uppercase tracking-wider border border-accent-default/15 text-accent-muted"
          >
            Search
          </button>
        </form>
      )}

      {error && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(220, 80, 80, 0.1)", color: "rgba(220, 120, 120, 0.8)" }}>
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center py-8">
          <p className="text-[11px] uppercase tracking-widest text-text-muted">
            Loading...
          </p>
        </div>
      )}

      {!loading && !error && view === "contacts" && <ContactsList contacts={contacts} />}
      {!loading && !error && view === "pipeline" && <PipelineView opportunities={opportunities} />}
      {!loading && !error && view === "conversations" && <ConversationsList conversations={conversations} />}
    </div>
  );
}

function ContactsList({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) {
    return <EmptyState icon="contacts" text="No contacts found" />;
  }

  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
      {contacts.map((c) => (
        <div
          key={c.id}
          className="rounded-lg px-3 py-2.5 flex items-center gap-3 bg-surface-1 border border-white/[0.06]"
        >
          <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold uppercase bg-accent-default/10 text-accent-default/70">
            {c.name.charAt(0) || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-text-primary/80">
              {c.name || "Unnamed"}
            </p>
            <p className="text-[10px] truncate text-text-tertiary">
              {c.email || c.phone || "No contact info"}
            </p>
          </div>
          {c.tags.length > 0 && (
            <div className="flex gap-1 shrink-0">
              {c.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-accent-default/8 text-accent-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PipelineView({ opportunities }: { opportunities: Opportunity[] }) {
  if (opportunities.length === 0) {
    return <EmptyState icon="pipeline" text="No opportunities found" />;
  }

  const grouped: Record<string, Opportunity[]> = {};
  for (const opp of opportunities) {
    const stage = opp.stage || "Unassigned";
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(opp);
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
      {Object.entries(grouped).map(([stage, opps]) => (
        <div key={stage}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-accent-muted">
              {stage}
            </span>
            <span className="text-[10px] text-text-muted">
              ({opps.length})
            </span>
          </div>
          <div className="space-y-1">
            {opps.map((opp) => (
              <div
                key={opp.id}
                className="rounded-lg px-3 py-2 flex items-center justify-between bg-surface-1 border border-white/[0.06]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate text-text-primary/80">
                    {opp.name}
                  </p>
                  {opp.contactName && (
                    <p className="text-[10px] truncate text-text-tertiary">
                      {opp.contactName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {opp.monetaryValue > 0 && (
                    <span className="text-xs font-medium text-accent-default/70">
                      ${opp.monetaryValue.toLocaleString()}
                    </span>
                  )}
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
                    style={{
                      background: opp.status === "won" ? "rgba(80, 180, 80, 0.12)" :
                                  opp.status === "lost" ? "rgba(220, 80, 80, 0.12)" :
                                  "rgba(200, 169, 126, 0.08)",
                      color: opp.status === "won" ? "rgba(80, 180, 80, 0.8)" :
                             opp.status === "lost" ? "rgba(220, 80, 80, 0.8)" :
                             "var(--color-accent-muted)",
                    }}
                  >
                    {opp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationsList({ conversations }: { conversations: Conversation[] }) {
  if (conversations.length === 0) {
    return <EmptyState icon="messages" text="No conversations found" />;
  }

  return (
    <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className="rounded-lg px-3 py-2.5 flex items-center gap-3 bg-surface-1 border border-white/[0.06]"
        >
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold uppercase text-accent-default/70"
            style={{
              background: conv.unreadCount > 0 ? "rgba(200, 169, 126, 0.15)" : "rgba(200, 169, 126, 0.06)",
            }}
          >
            {conv.contactName.charAt(0) || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium truncate text-text-primary/80">
                {conv.contactName || "Unknown"}
              </p>
              <span className="text-[9px] shrink-0 ml-2 text-text-muted">
                {conv.lastMessageDate ? formatRelativeDate(conv.lastMessageDate) : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase shrink-0 text-accent-default/40">
                {conv.lastMessageType || "msg"}
              </span>
              <p className="text-[10px] truncate text-text-tertiary">
                {conv.lastMessage || "No messages"}
              </p>
            </div>
          </div>
          {conv.unreadCount > 0 && (
            <span className="h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 bg-accent-default/25 text-accent-bright">
              {conv.unreadCount}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const paths: Record<string, React.ReactNode> = {
    contacts: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    pipeline: (
      <>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </>
    ),
    messages: (
      <>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </>
    ),
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="h-10 w-10 rounded-full flex items-center justify-center border border-accent-default/15">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-accent-default/30">
          {paths[icon] || paths.contacts}
        </svg>
      </div>
      <p className="text-[11px] uppercase tracking-widest text-text-muted">
        {text}
      </p>
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
