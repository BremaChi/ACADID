import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";

test("founder revenue overview aggregates ledger categories and subscriptions", async () => {
  const service = new AdminService(
    {
      revenueLedgerEntry: {
        groupBy: async ({ by }) => {
          if (by.includes("category")) {
            return [
              { category: "VERIFICATION_FEE", _sum: { amountMinor: 125000 }, _count: { _all: 25 } },
              { category: "CREDENTIAL_EXPORT_FEE", _sum: { amountMinor: 50000 }, _count: { _all: 5 } }
            ];
          }
          return [
            { status: "PAID", _sum: { amountMinor: 100000 }, _count: { _all: 20 } },
            { status: "BILLABLE", _sum: { amountMinor: 75000 }, _count: { _all: 10 } }
          ];
        },
        findMany: async () => [
          {
            uuid: "rev_1",
            category: "VERIFICATION_FEE",
            status: "PAID",
            amountMinor: 5000,
            currency: "NGN",
            institution: { institutionId: "AINI-0001", officialName: "Lagos State University" },
            sourceType: "VerificationEvent",
            sourceId: "ver_1",
            description: "Credential verification fee",
            occurredAt: new Date("2026-04-30T08:00:00.000Z")
          }
        ]
      },
      institutionSubscription: {
        findMany: async () => [
          {
            uuid: "sub_1",
            institution: { institutionId: "AINI-0001", officialName: "Lagos State University" },
            planCode: "FOUNDATION",
            status: "ACTIVE",
            amountMinor: 100000,
            currency: "NGN",
            billingInterval: "MONTHLY",
            currentPeriodEnd: new Date("2026-05-30T00:00:00.000Z"),
            nextBillingAt: new Date("2026-05-30T00:00:00.000Z")
          }
        ]
      },
      $queryRaw: async () => [{ day: "2026-04-30", amountMinor: 5000, count: 1 }]
    },
    {},
    {}
  );

  const revenue = await service.readRevenueOverview();

  assert.equal(revenue.currency, "NGN");
  assert.equal(revenue.totals.totalAmountMinor, 175000);
  assert.equal(revenue.totals.paidThisMonthMinor, 100000);
  assert.equal(revenue.totals.pendingThisMonthMinor, 75000);
  assert.equal(revenue.totals.activeSubscriptions, 1);
  assert.equal(revenue.categoryBreakdown.find((entry) => entry.category === "INSTITUTION_SUBSCRIPTION").amountMinor, 0);
  assert.equal(revenue.recentEntries[0].institutionName, "Lagos State University");
  assert.equal(revenue.subscriptions[0].planCode, "FOUNDATION");
});

test("founder revenue overview returns zeros when the ledger is empty", async () => {
  const service = new AdminService(
    {
      revenueLedgerEntry: {
        groupBy: async () => [],
        findMany: async () => []
      },
      institutionSubscription: {
        findMany: async () => []
      },
      $queryRaw: async () => []
    },
    {},
    {}
  );

  const revenue = await service.readRevenueOverview();

  assert.equal(revenue.totals.totalAmountMinor, 0);
  assert.equal(revenue.totals.openLedgerEntries, 0);
  assert.equal(revenue.daily.length, 31);
  assert.equal(revenue.recentEntries.length, 0);
});
