import { NextResponse } from "next/server";
import { EMAIL_RE, jsonStore, newId } from "@/lib/json-store";

interface Subscriber {
  id: string;
  email: string;
  topics: string[];
  createdAt: string;
}

const subscribers = jsonStore<Subscriber>("newsletter", "subscribers.json");

export async function GET() {
  return NextResponse.json({ count: subscribers.read().length });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const topics = Array.isArray(body.topics)
      ? body.topics.filter((t: unknown): t is string => typeof t === "string").slice(0, 8)
      : ["All Nigeria"];

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (subscribers.read().some((s) => s.email === email)) {
      return NextResponse.json({
        ok: true,
        alreadySubscribed: true,
        message: "You are already subscribed to the All About Nigeria newsletter.",
      });
    }

    const entry: Subscriber = {
      id: newId("sub"),
      email: email.slice(0, 140),
      topics,
      createdAt: new Date().toISOString(),
    };

    const count = subscribers.add(entry);

    return NextResponse.json(
      {
        ok: true,
        id: entry.id,
        count,
        message: "Subscribed! Welcome to the All About Nigeria dispatch.",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
