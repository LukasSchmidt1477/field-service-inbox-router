import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { createInfraiClient, InfraiError } from "./infrai_client.js";
import { routeFieldServiceRequest } from "./work_order.js";

const port = Number(process.env.PORT ?? 3000);
const teamInbox = process.env.TEAM_INBOX;
if (!teamInbox) throw new Error("TEAM_INBOX is required");
const captchaWidgetRecordId = process.env.CAPTCHA_WIDGET_RECORD_ID;
if (!captchaWidgetRecordId) throw new Error("CAPTCHA_WIDGET_RECORD_ID is required");
const infrai = createInfraiClient();

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/contact") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const result = await routeFieldServiceRequest(await readJson(request), {
      infrai,
      teamInbox,
      captchaWidgetRecordId,
    });
    sendJson(response, 202, result);
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "Invalid request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

server.listen(port, () => {
  console.log(`Field-service contact route listening on http://localhost:${port}/contact`);
});
