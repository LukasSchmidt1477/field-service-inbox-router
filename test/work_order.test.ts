import assert from "node:assert/strict";
import test from "node:test";
import type { InfraiClient } from "../src/infrai_client.js";
import { modelWorkOrder, routeFieldServiceRequest, submissionSchema } from "../src/work_order.js";

test("a water leak enters urgent dispatch and requires technician follow-up", () => {
  const submission = submissionSchema.parse({
    idempotencyKey: "f4f8d1c8-a328-4c0d-8457-691853ae35c5",
    captchaToken: "browser-captcha-token",
    customer: { name: "Mina Chen", email: "mina@example.com", phone: "+1-555-0102" },
    serviceAddress: "18 Cedar Street, Unit 4",
    issueType: "water_leak",
    details: "Water is collecting below the kitchen shutoff valve.",
    photos: [{ url: "https://example.com/uploads/leak.jpg", caption: "Valve under sink" }],
    technicianFollowUpRequested: false,
  });

  const order = modelWorkOrder(submission);

  assert.equal(order.dispatchStatus, "awaiting_dispatch");
  assert.equal(order.priority, "urgent");
  assert.equal(order.technicianFollowUp, "required");
  assert.equal(order.photos[0]?.caption, "Valve under sink");
});

test("captcha verification includes the configured widget record id", async () => {
  let captchaRequest: unknown;
  const infrai = {
    captcha: {
      verify: async (body: unknown) => {
        captchaRequest = body;
        return { valid: true };
      },
    },
    email: {
      send: async () => ({ message_id: "msg-test" }),
    },
  } as InfraiClient;

  await routeFieldServiceRequest({
    idempotencyKey: "f4f8d1c8-a328-4c0d-8457-691853ae35c5",
    captchaToken: "browser-captcha-token",
    customer: { name: "Mina Chen", email: "mina@example.com", phone: "+1-555-0102" },
    serviceAddress: "18 Cedar Street, Unit 4",
    issueType: "water_leak",
    details: "Water is collecting below the kitchen shutoff valve.",
    photos: [],
    technicianFollowUpRequested: false,
  }, {
    infrai,
    teamInbox: "chenhua@changba.com",
    captchaWidgetRecordId: "cwidget_test",
  });

  assert.deepEqual(captchaRequest, {
    widget_record_id: "cwidget_test",
    token: "browser-captcha-token",
    action: "field_service_contact",
    score_threshold: 0.6,
  });
});
