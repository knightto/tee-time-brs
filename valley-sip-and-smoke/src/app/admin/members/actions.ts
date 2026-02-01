"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

function normalizeStatus(status: string) {
  const allowed = Object.values(SubscriptionStatus);
  return allowed.includes(status as SubscriptionStatus) ? (status as SubscriptionStatus) : null;
}

export async function updateMember(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  const planId = String(formData.get("planId") || "");
  const status = String(formData.get("status") || "");
  const guestAllowance = Number(formData.get("guestAllowance") || 0);
  const notes = String(formData.get("notes") || "");

  if (!userId) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      guestAllowance: isNaN(guestAllowance) ? 2 : guestAllowance,
      notes: notes || null,
    },
  });

  const normalizedStatus = normalizeStatus(status);
  if (planId && normalizedStatus) {
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    if (existing) {
      await prisma.subscription.update({
        where: { userId },
        data: { planId, status: normalizedStatus },
      });
    } else {
      await prisma.subscription.create({
        data: { userId, planId, status: normalizedStatus },
      });
    }
  }

  revalidatePath("/admin/members");
}
