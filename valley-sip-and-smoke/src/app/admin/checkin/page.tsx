import { prisma } from "@/lib/prisma";
import CheckInClient from "@/app/admin/checkin/checkin-client";

export default async function AdminCheckInPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const events = await prisma.eventNight.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
    take: 8,
  });

  const eventOptions = events.map((event) => ({
    id: event.id,
    label: `${event.date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })} · ${event.startTime}-${event.endTime}`,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Check-in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scan member QR codes or use manual lookup to verify status and log attendance.
        </p>
      </div>
      {eventOptions.length ? (
        <CheckInClient events={eventOptions} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No upcoming event nights found. Add events before checking in members.
        </p>
      )}
    </div>
  );
}
