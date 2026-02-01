import { PrismaClient, SubscriptionStatus, UserRole } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

function dayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function nextDatesForDay(targetDay: number, count: number) {
  const dates: Date[] = [];
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  let dayOffset = (targetDay + 7 - start.getDay()) % 7;
  if (dayOffset === 0) {
    dayOffset = 7;
  }
  const first = new Date(start);
  first.setDate(first.getDate() + dayOffset);
  for (let i = 0; i < count; i += 1) {
    const next = new Date(first);
    next.setDate(first.getDate() + i * 7);
    dates.push(next);
  }
  return dates;
}

async function generateMemberCode() {
  while (true) {
    const code = `VS-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await prisma.user.findUnique({ where: { memberCode: code } });
    if (!existing) {
      return code;
    }
  }
}

async function seedPlans() {
  const plans = [
    {
      name: "Member",
      description: "Priority seating, member pour pricing, and portal access.",
      monthlyPriceCents: 3500,
    },
    {
      name: "Locker Member",
      description: "Member benefits plus reserved storage for a personal bottle.",
      monthlyPriceCents: 5500,
    },
  ];

  for (const plan of plans) {
    await prisma.membershipPlan.upsert({
      where: { name: plan.name },
      update: plan,
      create: plan,
    });
  }
}

async function seedEvents() {
  const thursdays = nextDatesForDay(4, 8);
  const sundays = nextDatesForDay(0, 8);
  const dates = [...thursdays, ...sundays];

  for (const date of dates) {
    await prisma.eventNight.upsert({
      where: { date_startTime: { date, startTime: "17:00" } },
      update: {},
      create: {
        date,
        startTime: "17:00",
        endTime: "21:00",
        capacity: 48,
        notes: "Hosted at On Cue Sports Bar & Grill. Limited seating, RSVP encouraged.",
        published: true,
      },
    });
  }
}

async function seedReserve() {
  let bottleData = await prisma.bottle.findMany();
  if (bottleData.length === 0) {
    const data = [
      {
        name: "Woodford Reserve Double Oaked",
        distillery: "Woodford Reserve",
        proof: 90.4,
        type: "Bourbon",
        notes: "Rich oak, vanilla, and baking spice.",
      },
      {
        name: "Four Roses Small Batch Select",
        distillery: "Four Roses",
        proof: 104,
        type: "Bourbon",
        notes: "Balanced fruit, rye spice, and caramel.",
      },
      {
        name: "Old Forester 1920",
        distillery: "Old Forester",
        proof: 115,
        type: "Bourbon",
        notes: "Bold cocoa and dark cherry.",
      },
      {
        name: "Elijah Craig Barrel Proof",
        distillery: "Heaven Hill",
        proof: 120.2,
        type: "Bourbon",
        notes: "Big barrel character, toasted sugar.",
      },
      {
        name: "Russell's Reserve 10 Year",
        distillery: "Wild Turkey",
        proof: 90,
        type: "Bourbon",
        notes: "Smooth toffee and tobacco leaf.",
      },
      {
        name: "Maker's Mark Cask Strength",
        distillery: "Maker's Mark",
        proof: 110,
        type: "Bourbon",
        notes: "Sweet spice with a long finish.",
      },
    ];

    for (const bottle of data) {
      await prisma.bottle.create({ data: bottle });
    }

    bottleData = await prisma.bottle.findMany();
  }

  const weekStart = startOfWeek(new Date());
  const label = `Week of ${dayLabel(weekStart)}`;

  const reserveWeek = await prisma.reserveWeek.upsert({
    where: { weekOfDate: weekStart },
    update: { label, published: true },
    create: { weekOfDate: weekStart, label, published: true },
  });

  const featured = bottleData.slice(0, 3);
  const leftovers = bottleData.slice(3, 6);

  await prisma.reserveItem.deleteMany({ where: { reserveWeekId: reserveWeek.id } });

  for (const bottle of featured) {
    await prisma.reserveItem.create({
      data: {
        reserveWeekId: reserveWeek.id,
        bottleId: bottle.id,
        isFeatured: true,
        publicPriceCents: 1600,
        memberPriceCents: 1400,
        pourOz: 2.0,
      },
    });
  }

  for (const bottle of leftovers) {
    await prisma.reserveItem.create({
      data: {
        reserveWeekId: reserveWeek.id,
        bottleId: bottle.id,
        isLeftover: true,
        publicPriceCents: 1400,
        memberPriceCents: 1250,
        pourOz: 2.0,
      },
    });
  }
}

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return;
  }

  const memberCode = await generateMemberCode();

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: UserRole.ADMIN },
    create: {
      email: adminEmail,
      role: UserRole.ADMIN,
      memberCode,
      subscription: {
        create: {
          plan: { connect: { name: "Member" } },
          status: SubscriptionStatus.COMPED,
        },
      },
    },
  });
}

async function main() {
  await seedPlans();
  await seedEvents();
  await seedReserve();
  await seedAdmin();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
