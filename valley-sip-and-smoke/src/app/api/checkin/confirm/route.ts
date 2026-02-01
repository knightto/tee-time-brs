import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user?.role !== "ADMIN" && session.user?.role !== "STAFF")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const userId = String(body.userId || "");
  const eventId = String(body.eventId || "");

  if (!userId || !eventId) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const checkIn = await prisma.checkIn.upsert({
    where: { userId_eventNightId: { userId, eventNightId: eventId } },
    update: { checkedInBy: session.user?.email ?? null },
    create: {
      userId,
      eventNightId: eventId,
      checkedInBy: session.user?.email ?? null,
    },
  });

  return NextResponse.json({ success: true, checkIn });
}
