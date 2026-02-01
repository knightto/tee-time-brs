import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { generateMemberCode } from "@/lib/member-code";

function priceIdForPlan(name: string, planPriceId?: string | null) {
  if (planPriceId) {
    return planPriceId;
  }
  if (name.toLowerCase().includes("locker")) {
    return process.env.STRIPE_PRICE_ID_LOCKER ?? null;
  }
  return process.env.STRIPE_PRICE_ID_MEMBER ?? null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const planId = String(body.planId || "");

  if (!email || !planId) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const plan = await prisma.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const memberCode = await generateMemberCode();
    user = await prisma.user.create({
      data: {
        email,
        memberCode,
      },
    });
  }

  const priceId = priceIdForPlan(plan.name, plan.stripePriceId);
  const origin = request.headers.get("origin") ?? "http://localhost:3000";

  if (stripe && priceId) {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/join?canceled=1`,
      metadata: { userId: user.id, planId: plan.id },
    });

    return NextResponse.json({ url: session.url });
  }

  const existing = await prisma.subscription.findUnique({ where: { userId: user.id } });
  if (existing) {
    await prisma.subscription.update({
      where: { userId: user.id },
      data: { planId: plan.id, status: "MANUAL" },
    });
  } else {
    await prisma.subscription.create({
      data: { userId: user.id, planId: plan.id, status: "MANUAL" },
    });
  }

  return NextResponse.json({ status: "manual" });
}
