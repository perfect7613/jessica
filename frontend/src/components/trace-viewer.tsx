"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  Users,
  Bot,
  ListChecks,
  Wrench,
  Clock,
  Zap,
} from "lucide-react";

export interface TraceEvent {
  event_type: string;
  timestamp: string;
  elapsed_ms: number;
  agent_role?: string;
  tool_name?: string;
  output_preview?: string;
  crew_name?: string;
  task_description?: string;
}

interface TraceViewerProps {
  events: TraceEvent[];
}

const eventConfig: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  crew: {
    icon: Users,
    color: "#d9ac5f",
    bg: "rgba(217, 172, 95, 0.12)",
    label: "Crew",
  },
  agent: {
    icon: Bot,
    color: "#78b478",
    bg: "rgba(120, 180, 120, 0.12)",
    label: "Agent",
  },
  task: {
    icon: ListChecks,
    color: "#7ca5d9",
    bg: "rgba(124, 165, 217, 0.12)",
    label: "Task",
  },
  tool: {
    icon: Wrench,
    color: "#dc4646",
    bg: "rgba(220, 70, 70, 0.12)",
    label: "Tool",
  },
};

function getEventConfig(eventType: string) {
  const key = Object.keys(eventConfig).find((k) =>
    eventType.toLowerCase().includes(k)
  );
  return (
    key
      ? eventConfig[key]
      : {
          icon: Zap,
          color: "rgb(160 160 170)",
          bg: "rgba(160, 160, 170, 0.1)",
          label: eventType,
        }
  );
}

function formatTimestamp(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

export function TraceViewer({ events }: TraceViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-[rgb(40_40_45)] bg-[rgb(22_22_26)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-[rgb(30_30_34)]"
      >
        <div className="flex items-center gap-3">
          <Clock className="size-4 text-[rgb(160_160_170)]" />
          <span className="font-serif text-lg text-foreground">
            Agent Reasoning Trace
          </span>
          <span className="text-xs text-[rgb(120_120_130)]">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-4 text-[rgb(160_160_170)]" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-[rgb(40_40_45)] px-6 py-4">
              <div className="relative ml-4">
                {/* Vertical timeline line */}
                <div className="absolute left-3 top-0 bottom-0 w-px bg-[rgb(40_40_45)]" />

                <div className="space-y-1">
                  {events.map((event, i) => {
                    const config = getEventConfig(event.event_type);
                    const Icon = config.icon;

                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.25,
                          delay: i * 0.04,
                          ease: "easeOut",
                        }}
                        className="relative flex items-start gap-4 py-2.5"
                      >
                        {/* Timeline dot */}
                        <div
                          className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: config.bg }}
                        >
                          <Icon
                            className="size-3"
                            style={{ color: config.color }}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="text-xs font-medium uppercase tracking-wider"
                              style={{ color: config.color }}
                            >
                              {config.label}
                            </span>

                            {event.agent_role && (
                              <span className="text-xs text-[rgb(160_160_170)] bg-[rgb(30_30_34)] px-1.5 py-0.5 rounded">
                                {event.agent_role}
                              </span>
                            )}

                            {event.tool_name && (
                              <span className="text-xs font-mono text-[rgb(160_160_170)] bg-[rgb(30_30_34)] px-1.5 py-0.5 rounded">
                                {event.tool_name}
                              </span>
                            )}

                            {event.crew_name && (
                              <span className="text-xs text-[#d9ac5f] bg-[rgba(217,172,95,0.1)] px-1.5 py-0.5 rounded">
                                {event.crew_name}
                              </span>
                            )}
                          </div>

                          {event.task_description && (
                            <p className="mt-1 text-xs text-[rgb(160_160_170)] leading-relaxed line-clamp-2">
                              {event.task_description}
                            </p>
                          )}

                          {event.output_preview && (
                            <p className="mt-1 text-xs text-[rgb(120_120_130)] leading-relaxed line-clamp-2 italic">
                              {event.output_preview}
                            </p>
                          )}

                          <div className="mt-1 flex items-center gap-3 text-[10px] text-[rgb(100_100_110)]">
                            <span>{formatTimestamp(event.timestamp)}</span>
                            <span>{event.elapsed_ms.toLocaleString()}ms</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
