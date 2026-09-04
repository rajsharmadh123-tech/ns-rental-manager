import { useLoaderData, useActionData, Form, Link, redirect } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";
import { checkProductAvailability } from "../utils/availability.server.js";
import { DEFAULT_WHATSAPP_TEMPLATES, formatWhatsAppMessage, generateWhatsAppLink } from "../utils/whatsapp.js";
import { getShopTemplates } from "../utils/whatsapp.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      customer: true,
      payments: true,
    },
  });

  if (!rental || rental.shop !== session.shop) {
    throw new Response("Rental Booking Not Found", { status: 404 });
  }

  const templates = await getShopTemplates(session.shop);

  const whatsappLinks = {
    confirmation: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.confirmation, rental)),
    pickup: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.pickup_reminder, rental)),
    returnReminder: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.return_reminder, rental)),
    overdue: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.overdue_reminder, rental, { lateFee: 500 })),
    payment: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.payment_reminder, rental)),
    cancellation: generateWhatsAppLink(rental.customerPhone, formatWhatsAppMessage(templates.cancellation, rental)),
  };

  return { rental, whatsappLinks };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;
  const formData = await request.formData();

  const actionType = formData.get("actionType");

  if (actionType === "updateStatus") {
    const status = formData.get("status");
    const paymentStatus = formData.get("paymentStatus");
    const notes = formData.get("notes")?.trim();

    const currentRental = await prisma.rental.findUnique({ where: { id } });

    if (status !== "CANCELLED" && status !== "RETURNED" && status !== "COMPLETED") {
      const availability = await checkProductAvailability({
        shop: session.shop,
        productId: currentRental.productId,
        variantId: currentRental.variantId,
        pickupDate: currentRental.pickupDate,
        returnDate: currentRental.returnDate,
        excludeRentalId: id,
      });

      if (!availability.isAvailable) {
        return { error: availability.message };
      }
    }

    await prisma.rental.update({
      where: { id, shop: session.shop },
      data: {
        status,
        paymentStatus,
        notes,
      },
    });

    return { success: "Booking status updated successfully!" };
  }

  if (actionType === "delete") {
    await prisma.rental.delete({
      where: { id, shop: session.shop },
    });
    return redirect("/app/rentals");
  }

  return null;
};

export default function RentalDetail() {
  const { rental } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading={`Booking: ${rental.bookingId || rental.id.slice(-8)}`}>
      <s-button slot="primary-action" href="/app/rentals">
        ← All Rentals
      </s-button>

      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      {/* Main Grid Details */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>

          {/* Left Column: Customer, Product & Financial Info */}
          <div>

            {/* Product & Rental Dates */}
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
              <s-stack direction="inline" justify="space-between" align="center">
                <s-heading>{rental.productTitle}</s-heading>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "13px",
                    fontWeight: "700",
                    backgroundColor:
                      rental.status === "CONFIRMED" ? "#e3f5e1" :
                      rental.status === "ACTIVE" || rental.status === "PICKED_UP" ? "#e0f2fe" :
                      rental.status === "COMPLETED" || rental.status === "RETURNED" ? "#f3f4f6" :
                      rental.status === "CANCELLED" ? "#ffe4e6" : "#fef3c7",
                    color:
                      rental.status === "CONFIRMED" ? "#166534" :
                      rental.status === "ACTIVE" || rental.status === "PICKED_UP" ? "#0369a1" :
                      rental.status === "COMPLETED" || rental.status === "RETURNED" ? "#374151" :
                      rental.status === "CANCELLED" ? "#9f1239" : "#92400e"
                  }}
                >
                  {rental.status}
                </span>
              </s-stack>

              {rental.variantId && (
                <div style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
                  Variant / Size: {rental.variantId}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px", backgroundColor: "#f9f9f9", padding: "12px", borderRadius: "8px" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Pickup Date</span>
                  <strong style={{ fontSize: "16px", color: "#111" }}>
                    {new Date(rental.pickupDate).toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Return Date</span>
                  <strong style={{ fontSize: "16px", color: "#111" }}>
                    {new Date(rental.returnDate).toLocaleDateString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                  </strong>
                </div>
              </div>
            </s-box>

            {/* Customer Details */}
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
              <s-heading>Customer Information</s-heading>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Full Name</span>
                  <strong>{rental.customerName}</strong>
                </div>

                <div>
                  <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Phone Number</span>
                  <strong>{rental.customerPhone}</strong>
                </div>

                {rental.whatsappNumber && (
                  <div>
                    <span style={{ fontSize: "12px", color: "#666", display: "block" }}>WhatsApp</span>
                    <span>{rental.whatsappNumber}</span>
                  </div>
                )}

                {rental.customerEmail && (
                  <div>
                    <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Email</span>
                    <span>{rental.customerEmail}</span>
                  </div>
                )}
              </div>

              {rental.customerAddress && (
                <div style={{ marginTop: "12px" }}>
                  <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Address</span>
                  <span>{rental.customerAddress}</span>
                </div>
              )}
            </s-box>

            {/* Financial Summary */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Financial Breakdown</s-heading>
              <div style={{ marginTop: "12px" }}>
                <div style={{ display: "flex", justify: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <span>Rental Price</span>
                  <strong>₹{rental.rentalPrice}</strong>
                </div>

                {rental.discount > 0 && (
                  <div style={{ display: "flex", justify: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", color: "#b00020" }}>
                    <span>Discount</span>
                    <span>-₹{rental.discount}</span>
                  </div>
                )}

                <div style={{ display: "flex", justify: "space-between", padding: "8px 0", borderBottom: "1px solid #eee", fontSize: "16px", fontWeight: "700" }}>
                  <span>Final Payable Amount</span>
                  <span>₹{rental.finalAmount || rental.rentalPrice}</span>
                </div>

                <div style={{ display: "flex", justify: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                  <span>Security Deposit</span>
                  <strong>₹{rental.securityDeposit || 0}</strong>
                </div>

                <div style={{ display: "flex", justify: "space-between", padding: "8px 0", marginTop: "4px" }}>
                  <span>Payment Status</span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "700",
                      backgroundColor:
                        rental.paymentStatus === "PAID" ? "#e3f5e1" :
                        rental.paymentStatus === "PARTIAL" ? "#fef3c7" : "#ffe4e6",
                      color:
                        rental.paymentStatus === "PAID" ? "#166534" :
                        rental.paymentStatus === "PARTIAL" ? "#92400e" : "#9f1239"
                    }}
                  >
                    {rental.paymentStatus}
                  </span>
                </div>
              </div>
            </s-box>

          </div>

          {/* Right Column: Status Update Actions & Notes */}
          <div>

            {/* Update Status Form */}
            <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
              <s-heading>Update Status</s-heading>
              <Form method="post" style={{ marginTop: "12px" }}>
                <input type="hidden" name="actionType" value="updateStatus" />

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Booking Status
                  </label>
                  <select
                    name="status"
                    defaultValue={rental.status}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                    <option value="PICKED_UP">Picked Up / Active</option>
                    <option value="ACTIVE">Active</option>
                    <option value="RETURNED">Returned</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Payment Status
                  </label>
                  <select
                    name="paymentStatus"
                    defaultValue={rental.paymentStatus}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                    <option value="REFUNDED">Refunded</option>
                  </select>
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    defaultValue={rental.notes || ""}
                    rows="3"
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>

                <s-button type="submit" style={{ width: "100%" }}>Save Status Update</s-button>
              </Form>
            </s-box>

            {/* Additional Actions & Printable Receipts */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-heading>Receipts & Quick Actions</s-heading>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                
                <Link
                  to={`/app/receipts/handover/${rental.id}`}
                  target="_blank"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "10px",
                    backgroundColor: "#005bd3",
                    color: "#fff",
                    borderRadius: "6px",
                    fontWeight: "600",
                    textDecoration: "none"
                  }}
                >
                  🖨️ Print Handover Receipt
                </Link>

                <Link
                  to={`/app/receipts/return/${rental.id}`}
                  target="_blank"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "10px",
                    backgroundColor: "#16803c",
                    color: "#fff",
                    borderRadius: "6px",
                    fontWeight: "600",
                    textDecoration: "none"
                  }}
                >
                  🖨️ Print Return & Refund Receipt
                </Link>

                {rental.customerPhone && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px", borderTop: "1px solid #eee", paddingTop: "10px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "700", color: "#555" }}>WhatsApp Quick Notifications:</label>
                    <a
                      href={whatsappLinks.confirmation}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#25D366", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      📩 Booking Confirmation
                    </a>
                    <a
                      href={whatsappLinks.pickup}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#25D366", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      📦 Pickup Reminder
                    </a>
                    <a
                      href={whatsappLinks.returnReminder}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#25D366", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      🔄 Return Reminder
                    </a>
                    <a
                      href={whatsappLinks.payment}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#25D366", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      💳 Payment Reminder
                    </a>
                    <a
                      href={whatsappLinks.overdue}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#dc2626", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      ⚠️ Overdue Alert
                    </a>
                    <a
                      href={whatsappLinks.cancellation}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "8px", backgroundColor: "#4b5563", color: "#fff", borderRadius: "6px", fontWeight: "600", fontSize: "12px", textAlign: "center", textDecoration: "none" }}
                    >
                      ❌ Cancellation Notice
                    </a>
                  </div>
                )}

                <Form method="post" onSubmit={(e) => { if (!confirm("Are you sure you want to delete this booking?")) e.preventDefault(); }}>
                  <input type="hidden" name="actionType" value="delete" />
                  <button
                    type="submit"
                    style={{
                      width: "100%",
                      padding: "10px",
                      backgroundColor: "#ffe4e6",
                      color: "#9f1239",
                      border: "0",
                      borderRadius: "6px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    🗑️ Delete Booking
                  </button>
                </Form>
              </div>
            </s-box>

          </div>

        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
