import { NextResponse } from "next/server";
import { jsonStore, newId } from "@/lib/json-store";

const CATEGORIES = [
  "wrong-info",
  "outdated-cost",
  "map-landmark",
  "missing-state-info",
  "bug",
  "suggestion",
] as const;

export interface FeedbackSubmission {
  id: string;
  pageUrl: string;
  category: (typeof CATEGORIES)[number];
  stateOrTopic: string;
  message: string;
  contactEmail?: string;
  createdAt: string;
  status: "received" | "reviewing" | "resolved";
}

const submissions = jsonStore<FeedbackSubmission>("feedback", "submissions.json");

export async function GET() {
  const items = submissions.read().map(({ contactEmail: _omit, ...safe }) => safe);
  return NextResponse.json({ count: items.length, submissions: items.slice(0, 50) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim().slice(0, 200) : "/";
    const stateOrTopic =
      typeof body.stateOrTopic === "string" ? body.stateOrTopic.trim().slice(0, 100) : "General";
    const contactEmail =
      typeof body.contactEmail === "string" && body.contactEmail.trim()
        ? body.contactEmail.trim().slice(0, 120)
        : undefined;

    const category = CATEGORIES.includes(body.category) ? body.category : "wrong-info";

    if (message.length < 5) {
      return NextResponse.json(
        { error: "Please include at least 5 characters describing what needs fixing." },
        { status: 400 }
      );
    }

    const entry: FeedbackSubmission = {
      id: newId("fb"),
      pageUrl,
      category,
      stateOrTopic,
      message: message.slice(0, 2000),
      contactEmail,
      createdAt: new Date().toISOString(),
      status: "received",
    };

    submissions.add(entry, 500);

    const { contactEmail: _omit, ...safeEntry } = entry;
    return NextResponse.json({ ok: true, submission: safeEntry }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
