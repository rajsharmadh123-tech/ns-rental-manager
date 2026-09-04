import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      rentals: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer || customer.shop !== session.shop) {
    throw new Response("Customer Profile Not Found", { status: 404 });
  }

  let totalRevenue = 0;
  let outstandingAmount = 0;
  let activeRentalsCount = 0;

  for (const r of customer.rentals) {
    if (r.status !== "CANCELLED") {
      totalRevenue += r.finalAmount || r.rentalPrice || 0;
      if (r.paymentStatus === "UNPAID" || r.paymentStatus === "PARTIAL") {
        outstandingAmount += (r.finalAmount || r.rentalPrice || 0);
      }
    }
    if (r.status === "ACTIVE" || r.status === "PICKED_UP" || r.status === "CONFIRMED" || r.status === "READY_FOR_PICKUP") {
      activeRentalsCount++;
    }
  }

  return {
    customer,
    totalRevenue,
    outstandingAmount,
    activeRentalsCount,
  };
};

export default function CustomerProfile() {
  const { customer, totalRevenue, outstandingAmount, activeRentalsCount } = useLoaderData();

  return (
    <s-page heading={`Customer: ${customer.name}`}>
      <s-button slot="primary-action" href="/app/customers">
        ← Back to Customers
      </s-button>

      {/* Customer Info & Summary Header */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>{customer.rentals.length}</s-heading>
            <s-paragraph>Total Bookings</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading style={{ color: "#005bd3" }}>{activeRentalsCount}</s-heading>
            <s-paragraph>Active Rentals</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading style={{ color: "#16803c" }}>₹{totalRevenue.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Total Revenue Spend</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading style={{ color: outstandingAmount > 0 ? "#b00020" : "#666" }}>
              ₹{outstandingAmount.toLocaleString("en-IN")}
            </s-heading>
            <s-paragraph>Outstanding Balance</s-paragraph>
          </s-box>

        </div>
      </s-section>

      {/* Contact & Address Profile Details */}
      <s-section heading="Contact Details">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>

            <div>
              <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Phone Number</span>
              <strong>{customer.phone}</strong>
            </div>

            {customer.whatsapp && (
              <div>
                <span style={{ fontSize: "12px", color: "#666", display: "block" }}>WhatsApp</span>
                <strong>{customer.whatsapp}</strong>
              </div>
            )}

            {customer.email && (
              <div>
                <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Email Address</span>
                <span>{customer.email}</span>
              </div>
            )}

          </div>

          {customer.address && (
            <div style={{ marginTop: "12px" }}>
              <span style={{ fontSize: "12px", color: "#666", display: "block" }}>Address</span>
              <span>{customer.address}</span>
            </div>
          )}

          {customer.phone && (
            <div style={{ marginTop: "16px" }}>
              <a
                href={`https://wa.me/${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `Hello ${customer.name}, greeting from NS Bridal & Groom Collection!`
                )}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  padding: "8px 16px",
                  backgroundColor: "#25D366",
                  color: "#fff",
                  borderRadius: "6px",
                  fontWeight: "600",
                  textDecoration: "none",
                  fontSize: "14px"
                }}
              >
                💬 Contact Customer on WhatsApp
              </a>
            </div>
          )}
        </s-box>
      </s-section>

      {/* Rental History Table */}
      <s-section heading={`Rental History (${customer.rentals.length})`}>
        {customer.rentals.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No rental history recorded for this customer.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Product</th>
                  <th style={{ padding: "10px" }}>Pickup Date</th>
                  <th style={{ padding: "10px" }}>Return Date</th>
                  <th style={{ padding: "10px" }}>Amount</th>
                  <th style={{ padding: "10px" }}>Booking Status</th>
                  <th style={{ padding: "10px" }}>Payment Status</th>
                  <th style={{ padding: "10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {customer.rentals.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>
                      <Link to={`/app/rentals/${r.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                        {r.bookingId || r.id.slice(-8)}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>{r.productTitle}</td>
                    <td style={{ padding: "10px" }}>{new Date(r.pickupDate).toLocaleDateString("en-IN")}</td>
                    <td style={{ padding: "10px" }}>{new Date(r.returnDate).toLocaleDateString("en-IN")}</td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>₹{r.rentalPrice}</td>
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor:
                            r.status === "CONFIRMED" ? "#e3f5e1" :
                            r.status === "ACTIVE" || r.status === "PICKED_UP" ? "#e0f2fe" :
                            r.status === "COMPLETED" || r.status === "RETURNED" ? "#f3f4f6" :
                            r.status === "CANCELLED" ? "#ffe4e6" : "#fef3c7",
                          color:
                            r.status === "CONFIRMED" ? "#166534" :
                            r.status === "ACTIVE" || r.status === "PICKED_UP" ? "#0369a1" :
                            r.status === "COMPLETED" || r.status === "RETURNED" ? "#374151" :
                            r.status === "CANCELLED" ? "#9f1239" : "#92400e"
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor:
                            r.paymentStatus === "PAID" ? "#e3f5e1" :
                            r.paymentStatus === "PARTIAL" ? "#fef3c7" : "#ffe4e6",
                          color:
                            r.paymentStatus === "PAID" ? "#166534" :
                            r.paymentStatus === "PARTIAL" ? "#92400e" : "#9f1239"
                        }}
                      >
                        {r.paymentStatus}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <s-button href={`/app/rentals/${r.id}`} variant="secondary">View</s-button>
                    </td>
                  </tr>
                ))}
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
