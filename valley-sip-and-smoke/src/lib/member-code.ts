import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export async function generateMemberCode() {
  while (true) {
    const code = `VS-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.user.findUnique({ where: { memberCode: code } });
    if (!existing) {
      return code;
    }
  }
}
