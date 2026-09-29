import { modelWorkOrder, renderInboxEmail, submissionSchema } from "../src/work_order.js";

const submission = submissionSchema.parse({
  idempotencyKey: "8a720428-d04c-490e-a185-f72b975b1330",
  captchaToken: "preview-token",
  customer: { name: "Mina Chen", email: "mina@example.com", phone: "+1-555-0102" },
  serviceAddress: "18 Cedar Street, Unit 4",
  issueType: "water_leak",
  details: "Water is collecting below the kitchen shutoff valve.",
  photos: [{ url: "https://example.com/uploads/leak.jpg", caption: "Valve under sink" }],
  technicianFollowUpRequested: false,
});

const order = modelWorkOrder(submission);
console.log(JSON.stringify({
  dispatchStatus: order.dispatchStatus,
  priority: order.priority,
  technicianFollowUp: order.technicianFollowUp,
  emailHtml: renderInboxEmail(order),
}, null, 2));
