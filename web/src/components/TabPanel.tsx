"use client";

import { useState, useCallback, type ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  badge?: number;
};

type TabPanelProps = {
  tabs: Tab[];
  children: Record<string, ReactNode>;
  defaultTab?: string;
};

export function TabPanel({ tabs, children, defaultTab }: TabPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");

  const handleTab = useCallback((id: string) => {
    setActiveTab(id);
  }, []);

  return (
    <div className="w-full rounded-2xl overflow-hidden"
      style={{
        background: "rgba(10, 22, 36, 0.6)",
        border: "1px solid rgba(200, 169, 126, 0.1)",
      }}
    >
      <div className="flex border-b" style={{ borderColor: "rgba(200, 169, 126, 0.08)" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTab(tab.id)}
            className="relative flex-1 px-3 py-3 text-[10px] font-medium uppercase tracking-[0.15em] transition-all duration-300"
            style={{
              color: activeTab === tab.id
                ? "rgba(226, 198, 157, 0.9)"
                : "rgba(244, 240, 234, 0.3)",
              background: activeTab === tab.id
                ? "rgba(200, 169, 126, 0.06)"
                : "transparent",
            }}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-mono"
                style={{
                  background: "rgba(200, 169, 126, 0.15)",
                  color: "rgba(226, 198, 157, 0.8)",
                }}
              >
                {tab.badge}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-px"
                style={{ background: "rgba(200, 169, 126, 0.4)" }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {children[activeTab]}
      </div>
    </div>
  );
}
