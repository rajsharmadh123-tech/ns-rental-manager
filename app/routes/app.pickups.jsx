import { useLoaderData, useActionData, Form, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Fetch rentals in pickup pipeline
  const pickupQueue = await prisma.rental.findMany({
    where: {
      shop: session.shop,
      status: {
        in: ["PENDING", "CONFIRMED", "READY_FOR_PICKUP"],
      },
    },
    orderBy: { pickupDate: "asc" },
  });

  return { pickupQueue };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const rentalId = formData.get("rentalId");
  const targetStatus = formData.get("targetStatus");

  if (!rentalId || !targetStatus) {
    return { error: "Invalid action parameters." };
  }

  await prisma.rental.update({
    where: { id: rentalId, shop: session.shop },
    data: {
      status: targetStatus,
    },
  });

  return { success: `Rental status updated to ${targetStatus}!` };
};

export default function PickupManagement() {
  const { pickupQueue } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Pickup Management Queue">

      <s-section>
        <s-heading>Ready & Upcoming Pickups</s-heading>
        <s-paragraph>
          Manage outfit fitting, ready-for-pickup notifications, and outfit handovers.
        </s-paragraph>
      </s-section>

      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      <s-section heading={`Pickup Queue (${pickupQueue.length})`}>
        {pickupQueue.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No pending or upcoming pickups in the queue.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Outfit / Product</th>
                  <th style={{ padding: "10px" }}>Pickup Date</th>
                  <th style={{ padding: "10px" }}>Rental Price</th>
                  <th style={{ padding: "10px" }}>Deposit</th>
                  <th style={{ padding: "10px" }}>Payment</th>
                  <th style={{ padding: "10px" }}>Current Status</th>
                  <th style={{ padding: "10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pickupQueue.map((r) => {
                  const pickupDateFormatted = new Date(r.pickupDate).toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "10px", fontWeight: "600" }}>
                        <Link to={`/app/rentals/${r.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                          {r.bookingId || r.id.slice(-8)}
                        </Link>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: "600" }}>{r.customerName}</div>
                        <div style={{ fontSize: "12px", color: "#666" }}>{r.customerPhone}</div>
                      </td>
                      <td style={{ padding: "10px" }}>{r.productTitle}</td>
                      <td style={{ padding: "10px", fontWeight: "600", color: "#005bd3" }}>
                        📅 {pickupDateFormatted}
                      </td>
                      <td style={{ padding: "10px", fontWeight: "600" }}>₹{r.rentalPrice}</td>
                      <td style={{ padding: "10px" }}>₹{r.securityDeposit || 0}</td>
                      <td style={{ padding: "10px" }}>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "600",
                            backgroundColor: r.paymentStatus === "PAID" ? "#e3f5e1" : "#ffe4e6",
                            color: r.paymentStatus === "PAID" ? "#166534" : "#9f1239"
                          }}
                        >
                          {r.paymentStatus}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "600",
                            backgroundColor: r.status === "READY_FOR_PICKUP" ? "#e3f5e1" : "#fef3c7",
                            color: r.status === "READY_FOR_PICKUP" ? "#166534" : "#92400e"
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {r.status !== "READY_FOR_PICKUP" && (
                            <Form method="post">
                              <input type="hidden" name="rentalId" value={r.id} />
                              <input type="hidden" name="targetStatus" value="READY_FOR_PICKUP" />
                              <button
                                type="submit"
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "4px",
                                  border: "1px solid #16803c",
                                  background: "#f0faf4",
                                  color: "#16803c",
                                  fontWeight: "600",
                                  fontSize: "12px",
                                  cursor: "pointer"
                                }}
                              >
                                Mark Ready
                              </button>
                            </Form>
                          )}

                          <Form method="post" onSubmit={(e) => { if (!confirm(`Confirm handover for ${r.customerName}?`)) e.preventDefault(); }}>
                            <input type="hidden" name="rentalId" value={r.id} />
                            <input type="hidden" name="targetStatus" value="PICKED_UP" />
                            <button
                              type="submit"
                              style={{
                                padding: "6px 10px",
                                borderRadius: "4px",
                                border: "0",
                                background: "#005bd3",
                                color: "#fff",
                                fontWeight: "600",
                                fontSize: "12px",
                                cursor: "pointer"
                              }}
                            >
                              Handover Outfit
                            </button>
                          </Form>

                          {r.customerPhone && (
                            <a
                              href={`https://wa.me/${r.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                `Hello ${r.customerName}, your rental outfit (${r.productTitle}) is ready for pickup at NS Bridal & Groom Collection for your booking ${r.bookingId || r.id.slice(-8)}. Pickup Date: ${pickupDateFormatted}.`
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                padding: "6px 10px",
                                borderRadius: "4px",
                                background: "#25D366",
                                color: "#fff",
                                fontWeight: "600",
                                fontSize: "12px",
                                textDecoration: "none"
                              }}
                            >
                              💬 WhatsApp
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
