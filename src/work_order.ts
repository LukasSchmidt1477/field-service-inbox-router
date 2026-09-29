import { z } from "zod";
import type { InfraiClient } from "./infrai_client.js";

export const submissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  captchaToken: z.string().min(1),
  customer: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().min(7).max(30),
  }),
  serviceAddress: z.string().min(5).max(300),
  issueType: z.enum(["gas_smell", "water_leak", "no_heat", "maintenance", "other"]),
  details: z.string().min(10).max(3000),
  photos: z.array(z.object({ url: z.string().url(), caption: z.string().max(160).optional() })).max(6),
  technicianFollowUpRequested: z.boolean().default(false),
});

export type FieldServiceSubmission = z.infer<typeof submissionSchema>;
export type DispatchPriority = "urgent" | "routine";

export type WorkOrder = FieldServiceSubmission & {
  dispatchStatus: "awaiting_dispatch";
  priority: DispatchPriority;
  technicianFollowUp: "required" | "standard";
};

const urgentIssues = new Set<FieldServiceSubmission["issueType"]>([
  "gas_smell",
  "water_leak",
  "no_heat",
]);

export function modelWorkOrder(submission: FieldServiceSubmission): WorkOrder {
  const priority: DispatchPriority = urgentIssues.has(submission.issueType) ? "urgent" : "routine";
  return {
    ...submission,
    dispatchStatus: "awaiting_dispatch",
    priority,
    technicianFollowUp:
      priority === "urgent" || submission.technicianFollowUpRequested ? "required" : "standard",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character] ?? character);
}

export function renderInboxEmail(order: WorkOrder): string {
  const photos = order.photos.length
    ? `<ul>${order.photos.map((photo) => `<li><a href="${escapeHtml(photo.url)}">${escapeHtml(photo.caption ?? "Work-order photo")}</a></li>`).join("")}</ul>`
    : "<p>No photos supplied.</p>";
  return [
    `<h1>${escapeHtml(order.priority.toUpperCase())} field-service request</h1>`,
    `<p><strong>Status:</strong> ${order.dispatchStatus}</p>`,
    `<p><strong>Customer:</strong> ${escapeHtml(order.customer.name)} (${escapeHtml(order.customer.email)}, ${escapeHtml(order.customer.phone)})</p>`,
    `<p><strong>Address:</strong> ${escapeHtml(order.serviceAddress)}</p>`,
    `<p><strong>Issue:</strong> ${escapeHtml(order.issueType)}</p>`,
    `<p>${escapeHtml(order.details)}</p>`,
    `<p><strong>Technician follow-up:</strong> ${order.technicianFollowUp}</p>`,
    photos,
  ].join("\n");
}

export async function routeFieldServiceRequest(
  input: unknown,
  dependencies: { infrai: InfraiClient; teamInbox: string; captchaWidgetRecordId: string },
) {
  const submission = submissionSchema.parse(input);
  await dependencies.infrai.captcha.verify({
    widget_record_id: dependencies.captchaWidgetRecordId,
    token: submission.captchaToken,
    action: "field_service_contact",
    score_threshold: 0.6,
  });

  const order = modelWorkOrder(submission);
  const delivery = await dependencies.infrai.email.send(
    {
      to: dependencies.teamInbox,
      subject: `[${order.priority.toUpperCase()}] ${order.issueType} at ${order.serviceAddress}`,
      html: renderInboxEmail(order),
    },
    submission.idempotencyKey,
  );
  return {
    messageId: delivery.message_id,
    dispatchStatus: order.dispatchStatus,
    priority: order.priority,
    technicianFollowUp: order.technicianFollowUp,
  };
}
