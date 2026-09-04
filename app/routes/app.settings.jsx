import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../utils/whatsapp.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  let settings = await prisma.rentalSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    settings = {
      businessName: "NS Bridal & Groom Collection",
      phone: "+91 98765 43210",
      whatsapp: "919876543210",
      email: "info@nsbridal.com",
      address: "Shop #12, Fashion Market, City Center",
      defaultDurationDays: 3,
      defaultDeposit: 2000,
      lateFeePerDay: 500,
      cancellationPolicy: "Full refund if cancelled 48 hours prior to pickup.",
      damagePolicy: "Damage repair cost will be deducted from security deposit.",
      generalTerms: "Valid Photo ID proof required at garment pickup.",
      receiptFooter: "Thank you for renting with NS Bridal & Groom Collection!",
      whatsappTemplates: JSON.stringify(DEFAULT_WHATSAPP_TEMPLATES),
    };
  }

  let parsedTemplates = DEFAULT_WHATSAPP_TEMPLATES;
  if (settings.whatsappTemplates) {
    try {
      parsedTemplates = { ...DEFAULT_WHATSAPP_TEMPLATES, ...JSON.parse(settings.whatsappTemplates) };
    } catch (e) {
      // Fallback
    }
  }

  return { settings, parsedTemplates };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const businessName = formData.get("businessName") || "NS Bridal & Groom Collection";
  const phone = formData.get("phone") || "";
  const whatsapp = formData.get("whatsapp") || "";
  const email = formData.get("email") || "";
  const address = formData.get("address") || "";

  const defaultDurationDays = parseInt(formData.get("defaultDurationDays") || "3", 10);
  const defaultDeposit = parseFloat(formData.get("defaultDeposit") || "2000");
  const lateFeePerDay = parseFloat(formData.get("lateFeePerDay") || "500");
  const cancellationPolicy = formData.get("cancellationPolicy") || "";
  const damagePolicy = formData.get("damagePolicy") || "";
  const generalTerms = formData.get("generalTerms") || "";
  const receiptFooter = formData.get("receiptFooter") || "";

  const whatsappTemplates = {
    confirmation: formData.get("template_confirmation") || DEFAULT_WHATSAPP_TEMPLATES.confirmation,
    pickup_reminder: formData.get("template_pickup_reminder") || DEFAULT_WHATSAPP_TEMPLATES.pickup_reminder,
    return_reminder: formData.get("template_return_reminder") || DEFAULT_WHATSAPP_TEMPLATES.return_reminder,
    overdue_reminder: formData.get("template_overdue_reminder") || DEFAULT_WHATSAPP_TEMPLATES.overdue_reminder,
    payment_reminder: formData.get("template_payment_reminder") || DEFAULT_WHATSAPP_TEMPLATES.payment_reminder,
    cancellation: formData.get("template_cancellation") || DEFAULT_WHATSAPP_TEMPLATES.cancellation,
  };

  await prisma.rentalSettings.upsert({
    where: { shop: session.shop },
    update: {
      businessName,
      phone,
      whatsapp,
      email,
      address,
      defaultDurationDays,
      defaultDeposit,
      lateFeePerDay,
      cancellationPolicy,
      damagePolicy,
      generalTerms,
      receiptFooter,
      whatsappTemplates: JSON.stringify(whatsappTemplates),
    },
    create: {
      shop: session.shop,
      businessName,
      phone,
      whatsapp,
      email,
      address,
      defaultDurationDays,
      defaultDeposit,
      lateFeePerDay,
      cancellationPolicy,
      damagePolicy,
      generalTerms,
      receiptFooter,
      whatsappTemplates: JSON.stringify(whatsappTemplates),
    },
  });

  return { success: "Rental Settings updated successfully!" };
};

export default function SettingsPage() {
  const { settings, parsedTemplates } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Rental Manager Settings">
      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      <Form method="post">
        {/* Business Profile */}
        <s-section heading="Business Profile">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Business Name</label>
                <input
                  type="text"
                  name="businessName"
                  defaultValue={settings.businessName || "NS Bridal & Groom Collection"}
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Contact Phone</label>
                <input
                  type="text"
                  name="phone"
                  defaultValue={settings.phone || ""}
                  placeholder="+91 98765 43210"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>WhatsApp Number (with country code)</label>
                <input
                  type="text"
                  name="whatsapp"
                  defaultValue={settings.whatsapp || ""}
                  placeholder="919876543210"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Support Email</label>
                <input
                  type="email"
                  name="email"
                  defaultValue={settings.email || ""}
                  placeholder="contact@nsbridal.com"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Store Address</label>
                <textarea
                  name="address"
                  defaultValue={settings.address || ""}
                  rows="2"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>
            </div>
          </s-box>
        </s-section>

        {/* Rental Policies & Defaults */}
        <s-section heading="Rental Rules & Policies">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Default Duration (Days)</label>
                <input
                  type="number"
                  name="defaultDurationDays"
                  defaultValue={settings.defaultDurationDays ?? 3}
                  min="1"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Default Deposit (₹)</label>
                <input
                  type="number"
                  name="defaultDeposit"
                  defaultValue={settings.defaultDeposit ?? 2000}
                  min="0"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Late Fee Per Day (₹)</label>
                <input
                  type="number"
                  name="lateFeePerDay"
                  defaultValue={settings.lateFeePerDay ?? 500}
                  min="0"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Cancellation Policy</label>
                <textarea
                  name="cancellationPolicy"
                  defaultValue={settings.cancellationPolicy || ""}
                  rows="3"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Damage & Repair Policy</label>
                <textarea
                  name="damagePolicy"
                  defaultValue={settings.damagePolicy || ""}
                  rows="3"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>General Rental Terms & Conditions</label>
                <textarea
                  name="generalTerms"
                  defaultValue={settings.generalTerms || ""}
                  rows="3"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>
            </div>
          </s-box>
        </s-section>

        {/* WhatsApp Message Templates */}
        <s-section heading="WhatsApp Message Templates">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
              Placeholders available: <code>{"{{customer_name}}"}</code>, <code>{"{{booking_id}}"}</code>, <code>{"{{product_name}}"}</code>, <code>{"{{pickup_date}}"}</code>, <code>{"{{return_date}}"}</code>, <code>{"{{rental_amount}}"}</code>, <code>{"{{deposit}}"}</code>, <code>{"{{balance}}"}</code>, <code>{"{{late_fee}}"}</code>.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Booking Confirmation Template</label>
                <textarea
                  name="template_confirmation"
                  defaultValue={parsedTemplates.confirmation}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Pickup Reminder Template</label>
                <textarea
                  name="template_pickup_reminder"
                  defaultValue={parsedTemplates.pickup_reminder}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Return Reminder Template</label>
                <textarea
                  name="template_return_reminder"
                  defaultValue={parsedTemplates.return_reminder}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Overdue Notice Template</label>
                <textarea
                  name="template_overdue_reminder"
                  defaultValue={parsedTemplates.overdue_reminder}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Payment Reminder Template</label>
                <textarea
                  name="template_payment_reminder"
                  defaultValue={parsedTemplates.payment_reminder}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Cancellation Notice Template</label>
                <textarea
                  name="template_cancellation"
                  defaultValue={parsedTemplates.cancellation}
                  rows="6"
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", fontFamily: "monospace", fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>
            </div>
          </s-box>
        </s-section>

        {/* Printable Receipt Options */}
        <s-section heading="Printable Receipt & Invoice Settings">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "600" }}>Receipt Footer & Thank You Message</label>
              <textarea
                name="receiptFooter"
                defaultValue={settings.receiptFooter || "Thank you for renting with NS Bridal & Groom Collection!"}
                rows="2"
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>
          </s-box>
        </s-section>

        {/* Growth Manch Development & About Section */}
        <s-section heading="About & Development Attribution">
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#F0EEFF", borderColor: "#D8D2FF" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "48px", height: "48px", backgroundColor: "#7964FF", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontWeight: "800", fontSize: "20px" }}>
                GM
              </div>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "#2E3346", fontWeight: "700" }}>
                  GM Rental Manager v1.0
                </h3>
                <p style={{ margin: "0", fontSize: "13px", color: "#2E3346" }}>
                  Custom Shopify Bridal & Groom Rental Management System developed by <strong style={{ color: "#7964FF" }}>Growth Manch</strong>.
                </p>
              </div>
            </div>
          </s-box>
        </s-section>

        <s-section style={{ marginTop: "24px" }}>
          <button type="submit" class="gm-btn-primary" style={{ cursor: "pointer", fontSize: "15px" }}>
            💾 Save Settings
          </button>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
