import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stringify } from "csv-stringify/sync";

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await prisma.eventNight.findUnique({
    where: { id: params.id },
    include: { rsvps: { include: { user: true } }, checkIns: { include: { user: true } } },
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const records = event.rsvps.map((rsvp) => {
    const checkIn = event.checkIns.find((item) => item.userId === rsvp.userId);
    return {
      email: rsvp.user.email,
      guestCount: rsvp.guestCount,
      status: rsvp.status,
      checkedInAt: checkIn?.checkedInAt?.toISOString() ?? "",
    };
  });

  const csv = stringify(records, { header: true });
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="event-${event.id}-rsvps.csv"`,
    },
  });
}
