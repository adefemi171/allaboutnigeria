"use client";

import { Flag } from "lucide-react";
import { openFeedbackModal } from "@/components/FeedbackWidget";

export function GuideFeedbackButton({ topic }: { topic: string }) {
  return (
    <button
      onClick={() => openFeedbackModal({ topic, category: "wrong-info" })}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00a862] px-3.5 py-2 text-xs font-semibold text-[#0b1620] transition hover:bg-[#00b46a]"
    >
      <Flag className="h-3.5 w-3.5" />
      Report Correction
    </button>
  );
}
