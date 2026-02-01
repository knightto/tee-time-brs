"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function submitRequest(formData: FormData) {
  const session = await getServerAuthSession();
  if (!session?.user?.email) {
    return;
  }

  const bottleName = String(formData.get("bottleName") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!bottleName) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return;
  }

  await prisma.bottleRequest.create({
    data: {
      userId: user.id,
      bottleName,
      notes: notes || null,
    },
  });

  revalidatePath("/member/requests");
}
