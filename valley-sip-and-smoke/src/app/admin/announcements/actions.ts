"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createAnnouncement(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const visibleFrom = String(formData.get("visibleFrom") || "");
  const visibleTo = String(formData.get("visibleTo") || "");

  if (!title || !body) {
    return;
  }

  await prisma.announcement.create({
    data: {
      title,
      body,
      visibleFrom: visibleFrom ? new Date(visibleFrom) : null,
      visibleTo: visibleTo ? new Date(visibleTo) : null,
      published: false,
    },
  });

  revalidatePath("/admin/announcements");
}

export async function toggleAnnouncement(formData: FormData) {
  const id = String(formData.get("id") || "");
  const published = formData.get("published") === "on";

  if (!id) {
    return;
  }

  await prisma.announcement.update({
    where: { id },
    data: { published },
  });

  revalidatePath("/admin/announcements");
}
