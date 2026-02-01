import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { SubscriptionStatus } from "@prisma/client";

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "paused":
      return "PAUSED";
    default:
      return "PAST_DUE";
  }
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const planId = session.metadata?.planId;
    const subscriptionId = session.subscription as string | null;

    if (userId && planId) {
      const existing = await prisma.subscription.findUnique({ where: { userId } });
      if (existing) {
        await prisma.subscription.update({
          where: { userId },
          data: {
            planId,
            stripeSubId: subscriptionId,
            stripeCustomerId: session.customer as string,
            status: "ACTIVE",
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId,
            planId,
            stripeSubId: subscriptionId,
            stripeCustomerId: session.customer as string,
            status: "ACTIVE",
          },
        });
      }
    }
  }

  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    await prisma.subscription.updateMany({
      where: { stripeSubId: subscription.id },
      data: {
        status: mapStripeStatus(subscription.status),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  return NextResponse.json({ received: true });
}
