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
  const memberCode = String(body.memberCode || "").trim();
  const eventId = body.eventId ? String(body.eventId) : null;

  if (!memberCode) {
    return NextResponse.json({ error: "Missing member code" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { memberCode },
    include: { subscription: { include: { plan: true } } },
  });

  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checkIn = eventId
    ? await prisma.checkIn.findUnique({
        where: { userId_eventNightId: { userId: user.id, eventNightId: eventId } },
      })
    : null;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      memberCode: user.memberCode,
      guestAllowance: user.guestAllowance,
      membershipStatus: user.subscription?.status ?? "Pending",
      plan: user.subscription?.plan?.name ?? "None",
    },
    alreadyCheckedIn: Boolean(checkIn),
  });
}
