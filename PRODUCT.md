# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

One user: Dafel's father, an Uber driver in Medellín, Colombia. He drives a BYD Yuan Plus (electric) on Uber and leases a second car (Renault Duster) to another driver. He handles a phone well (WhatsApp, Uber, bank apps) and wants speed, not hand-holding (confirmed by Dafel, 2026-10-12).

He opens the app in three moments (confirmed): between trips with the car parked (one hand, often in a hurry, day or night), at home at the end of the day, and on weekends or at month end.

## Product Purpose

Daily finances for a ride-hailing driver: log income and expenses, know what he really earned after car costs, see whether the month's fixed expenses and debts are covered, keep savings envelopes, and manage his cars (maintenance, documents, the Duster lease and its weekly payments). Success: he knows in seconds how the day and the month are going, and his records are complete enough to show a bank.

## Positioning

Built for one driver's real situation, not a generic expense tracker: Uber Pass versus commission, cash-trip commission, electric charging cost per kWh, pico y placa, the leased car's weekly payments in arrears with grace and recovery rules from his own contract, and a DIAN income-tax estimate.

## Operating Context

- Spanish (Colombia), Colombian pesos with dot thousands separators.
- The workday ends at 4 a.m. like Uber's (pending branch); the lease is paid on Tuesdays for the previous week.
- Data lives only on his phone (SQLite); backup is a JSON file he shares to his own WhatsApp.
- Updates arrive over the air (JS only) or as an APK he installs from a link.

## Capabilities and Constraints

- Five areas: Hoy, Historial, Balance, Fondos, Carros (with lease).
- Changes must be JavaScript-only (no new native dependencies) so they ship over the air; schema changes are additive only.
- Never require reinstalling; never lose data.
- Editing past movements was explicitly declined by Dafel on 2026-10-05 (open to revisit only if Dafel asks).
- Cost: zero; no paid services.

## Evidence on Hand

Realistic test data only (no real figures from the user's phone). Do not invent earnings, testimonials or benchmarks.

## Product Principles

1. The answer first: each screen leads with the one number he came for.
2. One tap from parked car to logged entry.
3. One concept, one number: never two different "how much did I earn / need" figures.
4. Nothing hidden: every action visible, no gesture-only features.
5. His data is sacred: every destructive action is confirmed and explained.

## Accessibility & Inclusion

Used outdoors in sunlight and at night inside a car: text must stay legible (no low-contrast grey hints), touch targets at least 48 dp, respect the system font size.
