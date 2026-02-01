"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function setRsvp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.email) {
    return;
  }

  const eventId = String(formData.get("eventId") || "");
  const guestCount = Number(formData.get("guestCount") || 0);

  if (!eventId) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return;
  }

  const allowedGuests = Math.max(0, user.guestAllowance ?? 2);
  const finalGuestCount = Math.min(Math.max(0, guestCount), allowedGuests);

  await prisma.rsvp.upsert({
    where: {
      userId_eventNightId: {
        userId: user.id,
        eventNightId: eventId,
      },
    },
    update: {
      guestCount: finalGuestCount,
      status: "GOING",
    },
    create: {
      userId: user.id,
      eventNightId: eventId,
      guestCount: finalGuestCount,
      status: "GOING",
    },
  });

  revalidatePath("/member/rsvp");
}

export async function cancelRsvp(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.email) {
    return;
  }

  const eventId = String(formData.get("eventId") || "");
  if (!eventId) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return;
  }

  await prisma.rsvp.updateMany({
    where: { userId: user.id, eventNightId: eventId },
    data: { status: "CANCELED" },
  });

  revalidatePath("/member/rsvp");
}
