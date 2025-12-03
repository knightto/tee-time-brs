
require('dotenv').config();
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const TripParticipant = require('../models/TripParticipant');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  await Trip.deleteMany({ name: /Myrtle Beach/ });
  await TripParticipant.deleteMany({});

  const trip = await Trip.create({
    name: 'Myrtle Beach – Barefoot Group 3/18–3/22/26',
    groupName: 'tommy knight Group-barefoot',
    location: 'Myrtle Beach, SC',
    arrivalDate: new Date('2026-03-18'),
    departureDate: new Date('2026-03-22'),
    packageType: '4 Nights / 5 Rounds (Founders Group package)',
    reservationNumber: '12972589',
    preparedBy: 'Myrtle Beach Golf Trips',
    contactPhone: '866.694.2448',
    baseGroupSize: 16,
    extraNightPricePerCondo: 130,
    notes: ''
  });

  const participants = [
    { name: 'Tommy Knight Jr' },
    { name: 'Tommy Knight Sr' },
    { name: 'Matt Shannon' },
    { name: 'John Hyers', depositPaidAmount: 100, depositPaidDate: new Date() },
    { name: 'Manny Ordonez', depositPaidAmount: 100, depositPaidDate: new Date() },
    { name: 'Marcus Ordonez' },
    { name: 'Dennis Freeman' },
    { name: 'Chris Neff' },
    { name: 'Kolby Madigan' },
    { name: 'Larry Morikawa' },
    { name: 'Reny Butler' },
    { name: 'Tom Lasik' },
    { name: 'Gary Knight' },
    { name: 'Matt Meehan' },
    { name: 'Glenn Dietz' },
    { name: 'Joe Gillette' },
    { name: 'Lance Dar' },
    { name: 'Charles Dotson' },
    { name: 'Brandon Nice' },
    { name: 'Larry Nice' },
    { name: 'Delmar Christian' }
  ];

  for (const p of participants) {
    await TripParticipant.create({ ...p, trip: trip._id });
  }

  console.log('Myrtle Beach trip and participants seeded.');
  process.exit();
}

seed();
