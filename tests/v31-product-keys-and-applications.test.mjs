import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";
import { PortalService } from "../apps/api/dist/apps/api/src/modules/portal/portal.service.js";

test("global API key listing supports product-owned MVP keys without secret material", async () => {
  const service = new AdminService(
    {
      apiKey: {
        findMany: async () => [
          {
            uuid: "product-key-1",
            ownerType: "PRODUCT",
            institutionId: null,
            productCode: "INSTITUTION_PORTAL",
            productName: "Institution Portal",
            clientId: "ak_sandbox_product",
            label: "Institution Portal Backend",
            scopes: ["institution:apply"],
            environment: "SANDBOX",
            status: "ACTIVE",
            rateLimitPerMinute: 1000,
            expiresAt: null,
            lastUsedAt: null,
            revokedAt: null,
            revokedReason: null,
            createdAt: new Date("2026-04-29T10:00:00.000Z"),
            updatedAt: new Date("2026-04-29T10:00:00.000Z"),
            institution: null
          }
        ]
      }
    },
    {},
    {}
  );

  const [key] = await service.listGlobalApiKeys();

  assert.equal(key.ownerType, "PRODUCT");
  assert.equal(key.ownerReference, "INSTITUTION_PORTAL");
  assert.equal(key.ownerLabel, "Institution Portal");
  assert.equal(key.institutionUuid, null);
  assert.equal("clientSecret" in key, false);
  assert.equal("clientSecretHash" in key, false);
});

test("portal institution application creates a pending founder-review item", async () => {
  const service = new PortalService({
    institutionApplication: {
      findFirst: async () => null,
      create: async ({ data }) => ({
        uuid: "application-1",
        officialName: data.officialName,
        type: data.type,
        status: "PENDING",
        createdAt: new Date("2026-04-29T10:00:00.000Z")
      })
    }
  });

  const application = await service.createInstitutionApplication(
    {
      sub: "api-key-1",
      email: "ak_sandbox_product@api-key.acadid.local",
      fullName: "Institution Portal Backend",
      role: "REGISTRAR",
      kind: "API_KEY",
      clientId: "ak_sandbox_product",
      productCode: "INSTITUTION_PORTAL",
      scopes: ["institution:apply"],
      environment: "SANDBOX",
      iat: 1,
      exp: 2
    },
    {
      officialName: "AcadID Model School",
      type: "SECONDARY_JSS",
      state: "Lagos",
      address: "12 Academic Road, Yaba, Lagos",
      contactPersonName: "Registrar One",
      contactEmail: "registrar@example.edu.ng",
      studentVolume: 2500,
      documentUploads: [{ label: "CAC certificate", storageUrl: "pending-secure-storage/cac.pdf" }],
      mouAccepted: true
    }
  );

  assert.equal(application.accepted, true);
  assert.equal(application.status, "PENDING");
  assert.equal(application.applicationId, "application-1");
  assert.equal(application.institutionType, "SECONDARY_JSS");
});

test("portal exposes current MOU version for application acceptance", () => {
  const service = new PortalService({ institutionApplication: {} });

  const mou = service.readMouVersion();

  assert.equal(mou.version, "2026.1");
  assert.equal(mou.acceptanceRequired, true);
  assert.equal(mou.acceptanceField, "mouAccepted");
});

test("portal upload URL issuance validates document metadata and audits the request", async () => {
  const auditEvents = [];
  const service = new PortalService(
    { institutionApplication: {} },
    {
      write: async (event) => {
        auditEvents.push(event);
      }
    }
  );

  const ticket = await service.issueUploadUrl(
    {
      sub: "api-key-1",
      email: "ak_sandbox_product@api-key.acadid.local",
      fullName: "Institution Portal Backend",
      role: "REGISTRAR",
      kind: "API_KEY",
      clientId: "ak_sandbox_product",
      productCode: "INSTITUTION_PORTAL",
      scopes: ["institution:apply"],
      environment: "SANDBOX",
      iat: 1,
      exp: 2
    },
    {
      fileName: "CAC Certificate.pdf",
      contentType: "application/pdf",
      sizeBytes: 120000,
      checksum: "sha256-example",
      purpose: "REGISTRATION_CERTIFICATE"
    }
  );

  assert.equal(ticket.method, "PUT");
  assert.equal(ticket.status, "PROVIDER_CONFIGURATION_REQUIRED");
  assert.equal(ticket.uploadUrl, null);
  assert.equal(ticket.document.label, "Registration Certificate");
  assert.equal(ticket.storageUrl.startsWith("storage://acadid-portal-intake/portal-applications/"), true);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].action, "portal.upload_url.issue");
  assert.equal(auditEvents[0].clientId, "ak_sandbox_product");
});
