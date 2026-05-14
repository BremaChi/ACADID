import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

type HttpResponse = {
  setHeader?: (name: string, value: string) => void;
  status: (statusCode: number) => HttpResponse;
  json: (body: unknown) => void;
};

type HttpRequest = {
  originalUrl?: string;
  url?: string;
};

const DATABASE_UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P2024"]);

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<HttpResponse>();
    const request = context.getRequest<HttpRequest>();

    const body = this.responseBody(exception);
    if (body.statusCode === HttpStatus.SERVICE_UNAVAILABLE && body.code === "DATABASE_UNAVAILABLE") {
      response.setHeader?.("retry-after", "10");
    }

    response.status(body.statusCode).json({
      ...body,
      timestamp: new Date().toISOString(),
      path: (request.originalUrl ?? request.url ?? "").split("?")[0]
    });
  }

  private responseBody(exception: unknown) {
    if (this.isDatabaseUnavailable(exception)) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: "DATABASE_UNAVAILABLE",
        retryable: true,
        message: "Supabase database is temporarily unavailable. Please check database connectivity and try again."
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "string") {
        return { statusCode, message: response };
      }
      if (response && typeof response === "object") {
        return { statusCode, ...(response as Record<string, unknown>) };
      }
      return { statusCode, message: exception.message };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error"
    };
  }

  private isDatabaseUnavailable(error: unknown): boolean {
    const code = this.errorCode(error);
    if (code && DATABASE_UNAVAILABLE_CODES.has(code)) {
      return true;
    }
    const message = error instanceof Error ? error.message : "";
    return /Can't reach database server|Timed out fetching a new connection|Operations timed out/i.test(message);
  }

  private errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== "object") {
      return undefined;
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
    return this.errorCode((error as { cause?: unknown }).cause);
  }
}
