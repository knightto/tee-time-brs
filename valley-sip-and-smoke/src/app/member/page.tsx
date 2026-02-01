import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUpcomingEvents, formatEventDate, formatEventTime } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/session";

export default async function MemberDashboard() {
  const session = await getServerAuthSession();
  const events = await getUpcomingEvents(3);
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      published: true,
      OR: [
        { visibleFrom: null, visibleTo: null },
        { visibleFrom: { lte: now }, visibleTo: null },
        { visibleFrom: null, visibleTo: { gte: now } },
        { visibleFrom: { lte: now }, visibleTo: { gte: now } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { subscription: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Member dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Limited seating. RSVP encouraged for priority seating and member benefits.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <div className="rounded-full bg-muted/60 px-3 py-1">
            Status: {user?.subscription?.status ?? "Pending"}
          </div>
          <div className="rounded-full bg-muted/60 px-3 py-1">
            Guest allowance: {user?.guestAllowance ?? 2}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Upcoming events</h2>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/member/rsvp">Manage RSVPs</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/print/rules-pricing">Print rules + pricing</Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((event) => (
            <Card key={event.id} className="border-border/70 bg-card/80">
              <CardContent className="pt-6">
                <p className="font-display text-xl">{formatEventDate(event.date)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatEventTime(event.startTime, event.endTime)}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Capacity {event.capacity}. RSVP encouraged.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Announcements</h2>
        <div className="space-y-3">
          {announcements.length ? (
            announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="rounded-2xl border border-border/70 bg-white/70 px-5 py-4"
              >
                <p className="font-display text-lg text-foreground">
                  {announcement.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {announcement.body}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No announcements right now.</p>
          )}
        </div>
      </section>
    </div>
  );
}
