"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function toggleReserveWeek(formData: FormData) {
  const weekId = String(formData.get("weekId") || "");
  const published = formData.get("published") === "on";
  if (!weekId) {
    return;
  }

  await prisma.reserveWeek.update({
    where: { id: weekId },
    data: { published },
  });

  revalidatePath("/admin/reserve");
}

export async function createReserveWeek(formData: FormData) {
  const label = String(formData.get("label") || "");
  const weekOfDate = String(formData.get("weekOfDate") || "");

  if (!label || !weekOfDate) {
    return;
  }

  await prisma.reserveWeek.create({
    data: {
      label,
      weekOfDate: new Date(`${weekOfDate}T00:00:00`),
      published: false,
    },
  });

  revalidatePath("/admin/reserve");
}

export async function createReserveItem(formData: FormData) {
  const weekId = String(formData.get("weekId") || "");
  const name = String(formData.get("name") || "").trim();
  const distillery = String(formData.get("distillery") || "").trim();
  const type = String(formData.get("type") || "").trim();
  const proof = String(formData.get("proof") || "").trim();
  const publicPriceCents = Number(formData.get("publicPriceCents") || 0);
  const memberPriceCents = Number(formData.get("memberPriceCents") || 0);
  const category = String(formData.get("category") || "featured");

  if (!weekId || !name) {
    return;
  }

  const bottle = await prisma.bottle.create({
    data: {
      name,
      distillery: distillery || null,
      type: type || null,
      proof: proof ? Number(proof) : null,
    },
  });

  await prisma.reserveItem.create({
    data: {
      reserveWeekId: weekId,
      bottleId: bottle.id,
      isFeatured: category === "featured",
      isLeftover: category === "leftover",
      publicPriceCents: publicPriceCents || 0,
      memberPriceCents: memberPriceCents || 0,
    },
  });

  revalidatePath("/admin/reserve");
}

export async function updateReserveItem(formData: FormData) {
  const itemId = String(formData.get("itemId") || "");
  const publicPriceCents = Number(formData.get("publicPriceCents") || 0);
  const memberPriceCents = Number(formData.get("memberPriceCents") || 0);
  const category = String(formData.get("category") || "featured");

  if (!itemId) {
    return;
  }

  await prisma.reserveItem.update({
    where: { id: itemId },
    data: {
      publicPriceCents: publicPriceCents || 0,
      memberPriceCents: memberPriceCents || 0,
      isFeatured: category === "featured",
      isLeftover: category === "leftover",
    },
  });

  revalidatePath("/admin/reserve");
}
