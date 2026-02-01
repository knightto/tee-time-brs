import { prisma } from "@/lib/prisma";

export default async function AdminOverviewPage() {
  const [memberCount, eventCount, rsvpCount, requestCount] = await Promise.all([
    prisma.user.count(),
    prisma.eventNight.count(),
    prisma.rsvp.count(),
    prisma.bottleRequest.count(),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Admin overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage membership, events, reserve lists, and announcements.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Members", value: memberCount },
          { label: "Event nights", value: eventCount },
          { label: "RSVPs", value: rsvpCount },
          { label: "Bottle requests", value: requestCount },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border/70 bg-white/70 px-6 py-5"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-2 font-display text-3xl text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
