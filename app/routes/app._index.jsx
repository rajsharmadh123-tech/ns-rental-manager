import { useLoaderData, useSubmit, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getDashboardMetrics } from "../utils/rental.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "month";
  const customStart = url.searchParams.get("customStart");
  const customEnd = url.searchParams.get("customEnd");

  const data = await getDashboardMetrics(session.shop, filter, customStart, customEnd);

  return {
    ...data,
    filter,
    customStart,
    customEnd,
  };
};

export default function Dashboard() {
  const { metrics, recentRentals, filter } = useLoaderData();
  const submit = useSubmit();

  const handleFilterChange = (e) => {
    const value = e.target.value;
    const formData = new FormData();
    formData.set("filter", value);
    submit(formData, { method: "get" });
  };

  return (
    <s-page heading="GM Rental Manager">

      <Link slot="primary-action" to="/app/rentals/new" className="gm-btn-primary">
        + New Rental
      </Link>

      {/* Overview Header & Date Filter */}
      <s-section>
        <s-stack direction="inline" justify="space-between" align="center">
          <div>
            <h2 className="gm-header-title" style={{ fontSize: "22px", margin: "0 0 4px" }}>Rental Dashboard</h2>
            <s-paragraph>
              Real-time overview for NS Bridal & Groom Collection rental operations.
            </s-paragraph>
          </div>

          <div>
            <label style={{ fontSize: "14px", fontWeight: "600", marginRight: "8px" }}>
              Filter Period:
            </label>
            <select
              value={filter}
              onChange={handleFilterChange}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </s-stack>
      </s-section>

      {/* Operational Metrics Cards */}
      <s-section heading="Operational Status">
        <s-stack direction="inline" gap="base">

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", minWidth: "140px" }}>
            <s-heading>{metrics.todaysRentals}</s-heading>
            <s-paragraph>Today's Pickups</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", minWidth: "140px" }}>
            <s-heading>{metrics.upcomingPickups}</s-heading>
            <s-paragraph>Upcoming Pickups</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", minWidth: "140px" }}>
            <s-heading>{metrics.todaysReturns}</s-heading>
            <s-paragraph>Today's Returns</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", minWidth: "140px", backgroundColor: metrics.overdueReturns > 0 ? "#fff0f0" : "inherit" }}>
            <s-heading style={{ color: metrics.overdueReturns > 0 ? "#b00020" : "inherit" }}>
              {metrics.overdueReturns}
            </s-heading>
            <s-paragraph style={{ color: metrics.overdueReturns > 0 ? "#b00020" : "inherit" }}>
              Overdue Returns
            </s-paragraph>
          </s-box>

        </s-stack>
      </s-section>

      {/* Booking Pipeline Cards */}
      <s-section heading="Booking Pipeline">
        <s-stack direction="inline" gap="base">

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1" }}>
            <s-heading>{metrics.pendingBookings}</s-heading>
            <s-paragraph>Pending Bookings</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1" }}>
            <s-heading>{metrics.confirmedBookings}</s-heading>
            <s-paragraph>Confirmed Bookings</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1" }}>
            <s-heading>{metrics.activeRentals}</s-heading>
            <s-paragraph>Active / Picked Up</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1" }}>
            <s-heading>{metrics.completedRentals}</s-heading>
            <s-paragraph>Completed / Returned</s-paragraph>
          </s-box>

        </s-stack>
      </s-section>

      {/* Financial Summary Cards */}
      <s-section heading="Financial Summary">
        <s-stack direction="inline" gap="base">

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", backgroundColor: "#f0faf4" }}>
            <s-heading style={{ color: "#16803c" }}>₹{metrics.totalRevenue.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Total Rental Revenue</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", backgroundColor: "#f4f6fb" }}>
            <s-heading style={{ color: "#005bd3" }}>₹{metrics.securityDepositsHeld.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Security Deposits Held</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ flex: "1", backgroundColor: "#fffdf0" }}>
            <s-heading style={{ color: "#9c6d00" }}>₹{metrics.pendingPayments.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Pending Payments</s-paragraph>
          </s-box>

        </s-stack>
      </s-section>

      {/* Recent Rentals List */}
      <s-section heading="Recent Bookings">
        {recentRentals.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No rental bookings found for the selected period.</s-paragraph>
            <div style={{ marginTop: "12px" }}>
              <s-button href="/app/rentals/new">+ Create First Rental</s-button>
            </div>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Product</th>
                  <th style={{ padding: "10px" }}>Pickup Date</th>
                  <th style={{ padding: "10px" }}>Return Date</th>
                  <th style={{ padding: "10px" }}>Amount</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRentals.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>
                      <Link to={`/app/rentals/${r.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                        {r.bookingId || r.id.slice(-8)}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <div><strong>{r.customerName}</strong></div>
                      <div style={{ fontSize: "12px", color: "#666" }}>{r.customerPhone}</div>
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
                      <s-button href={`/app/rentals/${r.id}`} variant="secondary">View</s-button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* Quick Actions */}
      <s-section heading="Quick Actions">
        <s-stack direction="inline" gap="base">
          <s-button href="/app/rentals/new">New Booking</s-button>
          <s-button href="/app/products" variant="secondary">Manage Products</s-button>
          <s-button href="/app/rentals" variant="secondary">View All Rentals</s-button>
        </s-stack>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};