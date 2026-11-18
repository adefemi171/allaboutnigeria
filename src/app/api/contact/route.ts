import { NextResponse } from "next/server";
import { EMAIL_RE, jsonStore, newId } from "@/lib/json-store";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

const messages = jsonStore<ContactMessage>("contact", "messages.json");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "General Inquiry";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (name.length < 2) {
      return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json(
        { error: "Please write a message of at least 10 characters." },
        { status: 400 }
      );
    }

    const entry: ContactMessage = {
      id: newId("msg"),
      name: name.slice(0, 100),
      email: email.slice(0, 140),
      subject: subject.slice(0, 140),
      message: message.slice(0, 3000),
      createdAt: new Date().toISOString(),
    };

    messages.add(entry, 500);

    return NextResponse.json(
      {
        ok: true,
        id: entry.id,
        message: "Message received! You can also write directly to adefemi@runeward.io.",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
