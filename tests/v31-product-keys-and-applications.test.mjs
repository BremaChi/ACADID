import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../apps/api/dist/apps/api/src/modules/admin/admin.service.js";
import { PortalService } from "../apps/api/dist/apps/api/src/modules/portal/portal.service.js";
import {
  createInstitutionApplicationSchema,
  institutionCategoryToBroadType,
  supportedInstitutionCategories
} from "../packages/shared/dist/index.js";

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
        institutionCategory: data.institutionCategory,
        academicTemplateCode: data.academicTemplateCode,
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
      institutionCategory: "NURSERY_PRIMARY_SECONDARY",
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
  assert.equal(application.institutionType, "NURSERY_PRIMARY_SECONDARY");
  assert.equal(application.institutionCategory, "NURSERY_PRIMARY_SECONDARY");
  assert.equal(application.broadType, "SECONDARY");
  assert.equal(application.academicTemplate.code, "FULL_BASIC_SECONDARY_TERM_CLASS_SUBJECT");
});

test("institution application schema accepts every supported category and maps broad type", () => {
  for (const institutionCategory of supportedInstitutionCategories) {
    const parsed = createInstitutionApplicationSchema.parse({
      officialName: `${institutionCategory} Demo Institution`,
      institutionCategory,
      state: "Lagos",
      address: "12 Academic Road, Yaba, Lagos",
      contactPersonName: "Registrar One",
      contactEmail: `${institutionCategory.toLowerCase()}@example.edu.ng`,
      studentVolume: 1000,
      mouAccepted: true
    });

    assert.equal(parsed.institutionCategory, institutionCategory);
    assert.equal(parsed.broadType, institutionCategoryToBroadType(institutionCategory));
    assert.equal(typeof parsed.academicTemplate.code, "string");
  }
});

test("founder approval preserves exact category while mapping broad institution type", async () => {
  let createdInstitutionData;
  let auditEvent;
  const application = {
    uuid: "application-poly-1",
    officialName: "AcadID Polytechnic",
    type: "POLYTECHNIC",
    institutionCategory: "POLYTECHNIC",
    state: "Lagos",
    contactPersonName: "Registrar One",
    contactEmail: "registrar-poly@example.edu.ng",
    mouAcceptedAt: new Date("2026-04-29T10:00:00.000Z"),
    status: "PENDING"
  };
  const tx = {
    institution: {
      count: async () => 0,
      create: async ({ data }) => {
        createdInstitutionData = data;
        return {
          uuid: "institution-1",
          institutionId: data.institutionId,
          officialName: data.officialName,
          type: data.type,
          institutionCategory: data.institutionCategory,
          academicTemplateCode: data.academicTemplateCode,
          state: data.state,
          tier: data.tier,
          status: data.status,
          mouSignedAt: data.mouSignedAt
        };
      }
    },
    institutionApplication: {
      update: async () => ({})
    },
    user: {
      upsert: async () => ({
        uuid: "registrar-user-1",
        email: application.contactEmail,
        fullName: application.contactPersonName
      })
    },
    institutionUser: {
      upsert: async () => ({
        uuid: "invite-1",
        status: "INVITED",
        inviteExpiresAt: new Date("2026-05-06T10:00:00.000Z"),
        user: {
          uuid: "registrar-user-1",
          email: application.contactEmail,
          fullName: application.contactPersonName
        }
      })
    }
  };
  const service = new AdminService(
    {
      institutionApplication: {
        findUnique: async () => application
      },
      $transaction: async (handler) => handler(tx)
    },
    {
      write: async (event) => {
        auditEvent = event;
      }
    },
    {
      hash: (value) => `hash:${value}`
    }
  );

  const result = await service.approveInstitutionApplication(
    {
      sub: "founder-admin-1",
      email: "founder@acadid.local",
      fullName: "Founder Admin",
      role: "FOUNDER_ADMIN",
      iat: 1,
      exp: 2
    },
    application.uuid
  );

  assert.equal(result.accepted, true);
  assert.equal(createdInstitutionData.type, "TERTIARY");
  assert.equal(createdInstitutionData.institutionCategory, "POLYTECHNIC");
  assert.equal(createdInstitutionData.academicTemplateCode, "POLYTECHNIC_SEMESTER_ND_HND_COURSE");
  assert.equal(auditEvent.metadata.broadType, "TERTIARY");
  assert.equal(auditEvent.metadata.institutionCategory, "POLYTECHNIC");
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
