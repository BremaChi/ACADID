import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import {
  BulkUploadParserService,
  NonRetryableJobError
} from "../apps/api/dist/apps/api/src/modules/jobs/bulk-upload-parser.service.js";

test("bulk upload parser maps common CSV school headers into student register rows", async () => {
  const parser = new BulkUploadParserService();
  const parsed = await parser.parseStudentUpload({
    institutionId: "AINi-00001",
    entryDate: "2026-01-10",
    fileName: "students.csv",
    csvText:
      'Student Name,Date of Birth,Admission No,Class,Programme,Phone\n"Ada, Grace",2010-05-14,ADM-001,SS2,Science,+2348000000000'
  });

  assert.equal(parsed.source.format, "csv");
  assert.equal(parsed.source.rowCount, 1);
  assert.deepEqual(parsed.input.rows[0], {
    fullName: "Ada, Grace",
    dateOfBirth: "2010-05-14",
    studentNumber: "ADM-001",
    level: "SS2",
    programme: "Science",
    phone: "+2348000000000"
  });
});

test("bulk upload parser reads XLSX content for student imports", async () => {
  const parser = new BulkUploadParserService();
  const parsed = await parser.parseStudentUpload({
    institutionId: "AINi-00001",
    fileName: "students.xlsx",
    contentBase64: createMinimalXlsx([
      ["fullName", "dateOfBirth", "studentNumber", "level", "programme", "phone"],
      ["Chinedu Okafor", "2011-02-03", "ADM-002", "JSS3", "General", ""]
    ]).toString("base64")
  });

  assert.equal(parsed.source.format, "xlsx");
  assert.equal(parsed.input.rows[0].studentNumber, "ADM-002");
});

test("bulk upload parser can read storage URLs through the worker storage adapter", async () => {
  const parser = new BulkUploadParserService({
    readObject: async (storageUrl) => {
      assert.equal(storageUrl, "storage://acadid-portal-intake/imports/students.csv");
      return {
        bucket: "acadid-portal-intake",
        key: "imports/students.csv",
        source: "supabase",
        content: Buffer.from(
          "fullName,dateOfBirth,studentNumber,level,programme\nBlessing Musa,2012-01-02,ADM-003,Primary 5,General"
        )
      };
    }
  });

  const parsed = await parser.parseStudentUpload({
    institutionId: "AINi-00001",
    fileName: "students.csv",
    storageUrl: "storage://acadid-portal-intake/imports/students.csv"
  });

  assert.equal(parsed.input.rows[0].studentNumber, "ADM-003");
});

test("bulk upload parser treats malformed student files as non-retryable", async () => {
  const parser = new BulkUploadParserService();
  await assert.rejects(
    () =>
      parser.parseStudentUpload({
        institutionId: "AINi-00001",
        fileName: "students.csv",
        csvText: "name,dob\nOnly Name,"
      }),
    NonRetryableJobError
  );
});

function createMinimalXlsx(rows) {
  const files = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`),
    "xl/worksheets/sheet1.xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>${rows.map((row, rowIndex) => xlsxRow(row, rowIndex + 1)).join("")}</sheetData>
      </worksheet>`)
  };

  return Buffer.from(zipSync(files));
}

function xlsxRow(cells, rowNumber) {
  return `<row r="${rowNumber}">${cells
    .map((value, index) => {
      const ref = `${String.fromCharCode(65 + index)}${rowNumber}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    })
    .join("")}</row>`;
}

function xml(value) {
  return strToU8(value.replace(/>\s+</g, "><").trim());
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
