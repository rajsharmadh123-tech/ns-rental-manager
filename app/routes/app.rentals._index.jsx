import { useLoaderData, useSubmit, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const query = url.searchParams.get("query") || "";
  const status = url.searchParams.get("status") || "ALL";
  const paymentStatus = url.searchParams.get("paymentStatus") || "ALL";

  const where = {
    shop: session.shop,
  };

  if (status !== "ALL") {
    where.status = status;
  }

  if (paymentStatus !== "ALL") {
    where.paymentStatus = paymentStatus;
  }

  if (query.trim() !== "") {
    where.OR = [
      { bookingId: { contains: query, mode: "insensitive" } },
      { customerName: { contains: query, mode: "insensitive" } },
      { customerPhone: { contains: query, mode: "insensitive" } },
      { productTitle: { contains: query, mode: "insensitive" } },
    ];
  }

  const rentals = await prisma.rental.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return {
    rentals,
    query,
    status,
    paymentStatus,
  };
};

export default function RentalsList() {
  const { rentals, query, status, paymentStatus } = useLoaderData();
  const submit = useSubmit();

  const handleFilterChange = (e) => {
    const form = e.target.form;
    submit(form, { method: "get" });
  };

  return (
    <s-page heading="Rentals Directory">

      <Link slot="primary-action" to="/app/rentals/new" className="gm-btn-primary">
        + New Booking
      </Link>

      {/* Search & Filters Bar */}
      <s-section>
        <form onChange={handleFilterChange} style={{ width: "100%" }}>
          <s-stack direction="inline" gap="base" align="center" justify="space-between">
            <div style={{ flex: "2", minWidth: "240px" }}>
              <input
                type="text"
                name="query"
                defaultValue={query}
                placeholder="Search by Booking ID, Customer, Phone, or Product..."
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <select
                name="status"
                defaultValue={status}
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "14px"
                }}
              >
                <option value="ALL">All Booking Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                <option value="PICKED_UP">Picked Up</option>
                <option value="ACTIVE">Active</option>
                <option value="RETURNED">Returned</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                name="paymentStatus"
                defaultValue={paymentStatus}
                style={{
                  padding: "10px",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  fontSize: "14px"
                }}
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
          </s-stack>
        </form>
      </s-section>

      {/* Rentals Table */}
      <s-section heading={`Rentals (${rentals.length})`}>
        {rentals.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No rentals match your search criteria.</s-paragraph>
            <div style={{ marginTop: "12px" }}>
              <s-button href="/app/rentals/new">+ Create New Rental</s-button>
            </div>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "12px 10px" }}>Booking ID</th>
                  <th style={{ padding: "12px 10px" }}>Customer</th>
                  <th style={{ padding: "12px 10px" }}>Product</th>
                  <th style={{ padding: "12px 10px" }}>Pickup</th>
                  <th style={{ padding: "12px 10px" }}>Return</th>
                  <th style={{ padding: "12px 10px" }}>Rental Price</th>
                  <th style={{ padding: "12px 10px" }}>Deposit</th>
                  <th style={{ padding: "12px 10px" }}>Booking Status</th>
                  <th style={{ padding: "12px 10px" }}>Payment</th>
                  <th style={{ padding: "12px 10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rentals.map((r) => (
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
                    <td style={{ padding: "10px" }}>{new Date(r.pickupDate).toLocaleDateString("en-IN")}</td>
                    <td style={{ padding: "10px" }}>{new Date(r.returnDate).toLocaleDateString("en-IN")}</td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>₹{r.rentalPrice}</td>
                    <td style={{ padding: "10px" }}>₹{r.securityDeposit || 0}</td>
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
