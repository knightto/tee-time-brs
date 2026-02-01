"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateEvent(formData: FormData) {
  const eventId = String(formData.get("eventId") || "");
  const capacity = Number(formData.get("capacity") || 0);
  const notes = String(formData.get("notes") || "");
  const published = formData.get("published") === "on";

  if (!eventId) {
    return;
  }

  await prisma.eventNight.update({
    where: { id: eventId },
    data: {
      capacity: isNaN(capacity) ? 0 : capacity,
      notes: notes || null,
      published,
    },
  });

  revalidatePath("/admin/events");
}

export async function createEvent(formData: FormData) {
  const date = String(formData.get("date") || "");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  const capacity = Number(formData.get("capacity") || 0);

  if (!date || !startTime || !endTime) {
    return;
  }

  await prisma.eventNight.create({
    data: {
      date: new Date(`${date}T00:00:00`),
      startTime,
      endTime,
      capacity: isNaN(capacity) ? 40 : capacity,
      published: true,
    },
  });

  revalidatePath("/admin/events");
}
