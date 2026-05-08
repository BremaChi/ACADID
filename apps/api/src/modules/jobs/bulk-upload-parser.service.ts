import { BadRequestException, Injectable } from "@nestjs/common";
import { ingestStudentRegisterSchema, type IngestStudentRegisterInput, type StudentRegisterRow } from "@acadid/shared";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readSheet } from "read-excel-file/node";

export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableJobError";
  }
}

type BulkUploadRequest = Record<string, unknown>;

type ParsedBulkUpload = {
  input: IngestStudentRegisterInput;
  source: {
    format: "inline_rows" | "csv" | "xlsx";
    fileName: string | null;
    rowCount: number;
  };
};

const headerMap: Record<string, keyof StudentRegisterRow> = {
  fullname: "fullName",
  full_name: "fullName",
  name: "fullName",
  studentname: "fullName",
  student_name: "fullName",
  learnername: "fullName",
  learner_name: "fullName",
  dateofbirth: "dateOfBirth",
  date_of_birth: "dateOfBirth",
  dob: "dateOfBirth",
  birthdate: "dateOfBirth",
  birth_date: "dateOfBirth",
  studentnumber: "studentNumber",
  student_number: "studentNumber",
  admissionnumber: "studentNumber",
  admission_number: "studentNumber",
  admissionno: "studentNumber",
  admission_no: "studentNumber",
  schoolid: "studentNumber",
  school_id: "studentNumber",
  learnerid: "studentNumber",
  learner_id: "studentNumber",
  level: "level",
  class: "level",
  gradelevel: "level",
  grade_level: "level",
  programme: "programme",
  program: "programme",
  department: "programme",
  track: "programme",
  phone: "phone",
  phonenumber: "phone",
  phone_number: "phone",
  mobile: "phone"
};

@Injectable()
export class BulkUploadParserService {
  async parseStudentUpload(request: BulkUploadRequest): Promise<ParsedBulkUpload> {
    const institutionId = this.stringField(request, "institutionId");
    if (!institutionId) {
      throw new NonRetryableJobError("Bulk upload file is missing institutionId.");
    }

    const entryDate = this.stringField(request, "entryDate");
    const inlineRows = request.rows;
    if (Array.isArray(inlineRows) && inlineRows.length > 0) {
      return this.validate({
        input: { institutionId, ...(entryDate ? { entryDate } : {}), rows: inlineRows as StudentRegisterRow[] },
        source: {
          format: "inline_rows",
          fileName: this.stringField(request, "fileName"),
          rowCount: inlineRows.length
        }
      });
    }

    const fileName = this.stringField(request, "fileName");
    const content = await this.readUploadContent(request);
    if (!content) {
      throw new NonRetryableJobError("Bulk upload needs rows, csvText, contentBase64, filePath, or a readable storageUrl.");
    }

    const format = this.detectFormat(request, fileName);
    const rows =
      format === "xlsx"
        ? await this.parseXlsx(content)
        : this.parseCsv(Buffer.isBuffer(content) ? content.toString("utf8") : String(content));

    return this.validate({
      input: { institutionId, ...(entryDate ? { entryDate } : {}), rows },
      source: { format, fileName, rowCount: rows.length }
    });
  }

  private validate(parsed: ParsedBulkUpload): ParsedBulkUpload {
    const result = ingestStudentRegisterSchema.safeParse(parsed.input);
    if (!result.success) {
      throw new NonRetryableJobError(`Bulk student upload validation failed: ${JSON.stringify(result.error.flatten())}`);
    }

    return {
      input: result.data,
      source: parsed.source
    };
  }

  private async readUploadContent(request: BulkUploadRequest): Promise<string | Buffer | null> {
    const csvText = this.stringField(request, "csvText");
    if (csvText) {
      return csvText;
    }

    const contentBase64 = this.stringField(request, "contentBase64");
    if (contentBase64) {
      return Buffer.from(contentBase64, "base64");
    }

    const filePath = this.stringField(request, "filePath") ?? this.pathFromStorageUrl(this.stringField(request, "storageUrl"));
    if (filePath) {
      if (!existsSync(filePath)) {
        throw new NonRetryableJobError("Bulk upload file path does not exist.");
      }
      return readFileSync(filePath);
    }

    const storageUrl = this.stringField(request, "storageUrl");
    if (storageUrl?.startsWith("http://") || storageUrl?.startsWith("https://")) {
      const response = await fetch(storageUrl);
      if (!response.ok) {
        throw new BadRequestException(`Could not fetch upload file: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    }

    return null;
  }

  private parseCsv(text: string): StudentRegisterRow[] {
    const records = this.csvRecords(text);
    if (records.length < 2) {
      throw new NonRetryableJobError("CSV upload must include a header row and at least one student row.");
    }

    const headers = records[0].map((header) => this.normaliseHeader(header));
    return records
      .slice(1)
      .filter((record) => record.some((cell) => cell.trim() !== ""))
      .map((record) => this.mapRecord(headers, record));
  }

  private async parseXlsx(content: string | Buffer): Promise<StudentRegisterRow[]> {
    const sheet = await readSheet(Buffer.isBuffer(content) ? content : Buffer.from(content));
    if (sheet.length < 2) {
      throw new NonRetryableJobError("XLSX upload must include a header row and at least one student row.");
    }

    const headers = sheet[0].map((header) => this.normaliseHeader(this.normaliseCell(header)));
    return sheet
      .slice(1)
      .filter((record) => record.some((cell) => this.normaliseCell(cell) !== ""))
      .map((record) => {
      const mapped: Partial<StudentRegisterRow> = {};
      headers.forEach((header, index) => {
        const target = headerMap[header];
        if (target) {
          mapped[target] = this.normaliseCell(record[index]);
        }
      });
      return mapped as StudentRegisterRow;
    });
  }

  private mapRecord(headers: string[], record: string[]): StudentRegisterRow {
    const row: Partial<StudentRegisterRow> = {};
    headers.forEach((header, index) => {
      const target = headerMap[header];
      if (target) {
        row[target] = this.normaliseCell(record[index] ?? "");
      }
    });
    return row as StudentRegisterRow;
  }

  private csvRecords(text: string): string[][] {
    const rows: string[][] = [];
    let current = "";
    let row: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        row.push(current.trim());
        current = "";
        continue;
      }
      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          index += 1;
        }
        row.push(current.trim());
        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }
        row = [];
        current = "";
        continue;
      }

      current += char;
    }

    row.push(current.trim());
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }

    return rows;
  }

  private detectFormat(request: BulkUploadRequest, fileName: string | null): "csv" | "xlsx" {
    const explicit = this.stringField(request, "format")?.toLowerCase();
    const name = fileName?.toLowerCase() ?? this.stringField(request, "storageUrl")?.toLowerCase() ?? "";
    if (explicit === "xlsx" || explicit === "xls" || name.endsWith(".xlsx") || name.endsWith(".xls")) {
      return "xlsx";
    }
    return "csv";
  }

  private normaliseHeader(value: string) {
    return value
      .trim()
      .replace(/^\uFEFF/, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
  }

  private normaliseCell(value: unknown) {
    return String(value ?? "").trim();
  }

  private stringField(request: BulkUploadRequest, field: string) {
    const value = request[field];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private pathFromStorageUrl(storageUrl: string | null) {
    if (!storageUrl?.startsWith("file://")) {
      return null;
    }
    return fileURLToPath(storageUrl);
  }
}
