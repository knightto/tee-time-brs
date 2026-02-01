import { prisma } from "@/lib/prisma";

export type EventSummary = {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
  capacity: number;
  notes: string | null;
};

export async function getUpcomingEvents(limit = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.eventNight.findMany({
    where: {
      date: { gte: today },
      published: true,
    },
    orderBy: { date: "asc" },
    take: limit,
  });
}

export function formatEventDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatEventTime(startTime: string, endTime: string) {
  return `${startTime}–${endTime}`;
}

export function getNextRecurringDates(count = 2) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  const days = [0, 4];

  for (let i = 0; i < count; i += 1) {
    const day = days[i % days.length];
    const next = new Date(today);
    const offset = (day + 7 - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + offset + Math.floor(i / 2) * 7);
    dates.push(next);
  }

  return dates;
}
