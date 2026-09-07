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
    <s-page heading="GM Rental Manager" inline-size="large">

      <Link slot="primary-action" to="/app/rentals/new" className="gm-btn-primary">
        <span>+</span>
        <span>New Rental</span>
      </Link>

      <style>{`
        .gm-dash-wrap {
          font-family: var(--gm-font);
          color: #2E3346;
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 100%;
          max-width: 100%;
          padding: 4px 0 20px 0;
        }

        .gm-dash-card {
          background-color: #FFFFFF;
          border-radius: 16px;
          border: 1px solid #E2E4EB;
          box-shadow: 0 4px 20px -2px rgba(46, 51, 70, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .gm-dash-card:hover {
          box-shadow: 0 8px 24px -4px rgba(46, 51, 70, 0.08);
        }

        .gm-dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          padding: 20px 24px;
          background: linear-gradient(135deg, #FFFFFF 0%, #FAFBFD 100%);
          border-radius: 16px;
          border: 1px solid #E2E4EB;
        }

        .gm-filter-select {
          padding: 9px 16px;
          border-radius: 10px;
          border: 1px solid #D8DCE6;
          background-color: #FFFFFF;
          font-family: var(--gm-font);
          font-size: 13.5px;
          font-weight: 600;
          color: #2E3346;
          cursor: pointer;
          outline: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: all 0.2s ease;
        }

        .gm-filter-select:focus {
          border-color: #7964FF;
          box-shadow: 0 0 0 3px rgba(121, 100, 255, 0.18);
        }

        .gm-section-title {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: #2E3346;
          margin: 0 0 14px 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .gm-grid-4 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
          width: 100%;
        }

        .gm-grid-3 {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
          width: 100%;
        }

        .gm-stat-tile {
          background-color: #FFFFFF;
          border: 1px solid #E2E4EB;
          border-radius: 14px;
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: relative;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .gm-stat-tile:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px -2px rgba(46, 51, 70, 0.07);
        }

        .gm-stat-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .gm-stat-label {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #646B7C;
        }

        .gm-stat-icon-wrap {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .gm-stat-num {
          font-size: 30px;
          font-weight: 800;
          color: #2E3346;
          line-height: 1;
          letter-spacing: -0.03em;
        }

        .gm-stat-sub {
          font-size: 12px;
          color: #646B7C;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .gm-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }

        .gm-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13.5px;
        }

        .gm-table th {
          background-color: #F8F9FC;
          color: #646B7C;
          font-weight: 600;
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 14px 20px;
          border-bottom: 1px solid #E2E4EB;
          text-align: left;
        }

        .gm-table td {
          padding: 15px 20px;
          border-bottom: 1px solid #F0F2F6;
          color: #2E3346;
          vertical-align: middle;
        }

        .gm-table tr:last-child td {
          border-bottom: none;
        }

        .gm-table tr:hover td {
          background-color: #FAFBFD;
        }

        .gm-action-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          border-radius: 12px;
          background-color: #FFFFFF;
          border: 1px solid #E2E4EB;
          color: #2E3346;
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .gm-action-pill-btn:hover {
          background-color: #F0EEFF;
          border-color: #D8D2FF;
          color: #7964FF;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(121, 100, 255, 0.15);
        }
      `}</style>

      <div className="gm-dash-wrap">

        {/* Modern Full-Width Header Card */}
        <div className="gm-dash-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <h2 className="gm-header-title" style={{ fontSize: "22px", margin: 0 }}>Rental Dashboard</h2>
              <span style={{
                backgroundColor: "#F0EEFF",
                color: "#7964FF",
                border: "1px solid #D8D2FF",
                padding: "3px 10px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: "700"
              }}>
                Live Hub
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "13.5px", color: "#646B7C" }}>
              Real-time overview for NS Bridal & Groom Collection rental operations.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#646B7C" }}>
              Period:
            </span>
            <select
              value={filter}
              onChange={handleFilterChange}
              className="gm-filter-select"
            >
              <option value="today">📅 Today</option>
              <option value="week">🗓️ This Week</option>
              <option value="month">📊 This Month</option>
            </select>
          </div>
        </div>

        {/* 1. Operational Status Cards */}
        <div>
          <h3 className="gm-section-title">
            <span>⚡</span>
            <span>Operational Status</span>
          </h3>

          <div className="gm-grid-4">
            {/* Today's Pickups */}
            <div className="gm-stat-tile" style={{ borderLeft: "4px solid #7964FF" }}>
              <div className="gm-stat-top">
                <span className="gm-stat-label">Today's Pickups</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#F0EEFF", color: "#7964FF" }}>
                  📦
                </div>
              </div>
              <div className="gm-stat-num">{metrics.todaysRentals}</div>
              <div className="gm-stat-sub">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#7964FF" }} />
                <span>Outfits for Handover</span>
              </div>
            </div>

            {/* Upcoming Pickups */}
            <div className="gm-stat-tile" style={{ borderLeft: "4px solid #6366F1" }}>
              <div className="gm-stat-top">
                <span className="gm-stat-label">Upcoming Pickups</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#EEF2FF", color: "#6366F1" }}>
                  📅
                </div>
              </div>
              <div className="gm-stat-num">{metrics.upcomingPickups}</div>
              <div className="gm-stat-sub">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#6366F1" }} />
                <span>Scheduled this period</span>
              </div>
            </div>

            {/* Today's Returns */}
            <div className="gm-stat-tile" style={{ borderLeft: "4px solid #10B981" }}>
              <div className="gm-stat-top">
                <span className="gm-stat-label">Today's Returns</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#ECFDF5", color: "#10B981" }}>
                  🔄
                </div>
              </div>
              <div className="gm-stat-num">{metrics.todaysReturns}</div>
              <div className="gm-stat-sub">
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#10B981" }} />
                <span>Pending Inspection</span>
              </div>
            </div>

            {/* Overdue Returns */}
            <div
              className="gm-stat-tile"
              style={{
                borderLeft: "4px solid #EF4444",
                backgroundColor: metrics.overdueReturns > 0 ? "#FEF2F2" : "#FFFFFF",
                borderColor: metrics.overdueReturns > 0 ? "#FECACA" : "#E2E4EB"
              }}
            >
              <div className="gm-stat-top">
                <span className="gm-stat-label" style={{ color: metrics.overdueReturns > 0 ? "#991B1B" : "#646B7C" }}>
                  Overdue Returns
                </span>
                <div
                  className="gm-stat-icon-wrap"
                  style={{
                    backgroundColor: metrics.overdueReturns > 0 ? "#FEE2E2" : "#F3F4F6",
                    color: metrics.overdueReturns > 0 ? "#DC2626" : "#646B7C"
                  }}
                >
                  ⚠️
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: metrics.overdueReturns > 0 ? "#DC2626" : "#2E3346" }}>
                {metrics.overdueReturns}
              </div>
              <div className="gm-stat-sub" style={{ color: metrics.overdueReturns > 0 ? "#B91C1C" : "#646B7C" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: metrics.overdueReturns > 0 ? "#DC2626" : "#10B981" }} />
                <span>{metrics.overdueReturns > 0 ? "Urgent Action Required!" : "All returns on schedule"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Booking Pipeline Cards */}
        <div>
          <h3 className="gm-section-title">
            <span>🔄</span>
            <span>Booking Pipeline</span>
          </h3>

          <div className="gm-grid-4">
            {/* Pending Bookings */}
            <div className="gm-stat-tile">
              <div className="gm-stat-top">
                <span className="gm-stat-label">Pending Bookings</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>
                  ⏳
                </div>
              </div>
              <div className="gm-stat-num">{metrics.pendingBookings}</div>
              <div className="gm-stat-sub">Awaiting confirmation</div>
            </div>

            {/* Confirmed Bookings */}
            <div className="gm-stat-tile">
              <div className="gm-stat-top">
                <span className="gm-stat-label">Confirmed Bookings</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#F0EEFF", color: "#7964FF" }}>
                  ✅
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#7964FF" }}>{metrics.confirmedBookings}</div>
              <div className="gm-stat-sub">Ready for event dates</div>
            </div>

            {/* Active / Picked Up */}
            <div className="gm-stat-tile">
              <div className="gm-stat-top">
                <span className="gm-stat-label">Active / Picked Up</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#E0F2FE", color: "#0284C7" }}>
                  👗
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#0284C7" }}>{metrics.activeRentals}</div>
              <div className="gm-stat-sub">Currently with customers</div>
            </div>

            {/* Completed / Returned */}
            <div className="gm-stat-tile">
              <div className="gm-stat-top">
                <span className="gm-stat-label">Completed / Returned</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                  🏁
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#059669" }}>{metrics.completedRentals}</div>
              <div className="gm-stat-sub">Successfully returned</div>
            </div>
          </div>
        </div>

        {/* 3. Luxury Financial Summary Cards */}
        <div>
          <h3 className="gm-section-title">
            <span>💳</span>
            <span>Financial Summary</span>
          </h3>

          <div className="gm-grid-3">
            {/* Total Revenue */}
            <div
              className="gm-stat-tile"
              style={{
                background: "linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 85%)",
                borderColor: "#A7F3D0"
              }}
            >
              <div className="gm-stat-top">
                <span className="gm-stat-label" style={{ color: "#065F46" }}>Total Rental Revenue</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#D1FAE5", color: "#059669" }}>
                  💰
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#059669", fontSize: "32px" }}>
                ₹{metrics.totalRevenue.toLocaleString("en-IN")}
              </div>
              <div className="gm-stat-sub" style={{ color: "#047857" }}>
                <span>Confirmed & active rentals</span>
              </div>
            </div>

            {/* Security Deposits Held */}
            <div
              className="gm-stat-tile"
              style={{
                background: "linear-gradient(135deg, #F0EEFF 0%, #FFFFFF 85%)",
                borderColor: "#D8D2FF"
              }}
            >
              <div className="gm-stat-top">
                <span className="gm-stat-label" style={{ color: "#4C1D95" }}>Security Deposits Held</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#E0DBFF", color: "#7964FF" }}>
                  🛡️
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#7964FF", fontSize: "32px" }}>
                ₹{metrics.securityDepositsHeld.toLocaleString("en-IN")}
              </div>
              <div className="gm-stat-sub" style={{ color: "#5B21B6" }}>
                <span>Refundable on post-event check</span>
              </div>
            </div>

            {/* Pending Payments */}
            <div
              className="gm-stat-tile"
              style={{
                background: "linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 85%)",
                borderColor: "#FED7AA"
              }}
            >
              <div className="gm-stat-top">
                <span className="gm-stat-label" style={{ color: "#9A3412" }}>Pending Payments</span>
                <div className="gm-stat-icon-wrap" style={{ backgroundColor: "#FFEDD5", color: "#D97706" }}>
                  ⏳
                </div>
              </div>
              <div className="gm-stat-num" style={{ color: "#D97706", fontSize: "32px" }}>
                ₹{metrics.pendingPayments.toLocaleString("en-IN")}
              </div>
              <div className="gm-stat-sub" style={{ color: "#9A3412" }}>
                <span>Outstanding customer balance</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Recent Bookings Table Card */}
        <div className="gm-dash-card">
          <div style={{
            padding: "20px 24px",
            borderBottom: "1px solid #E2E4EB",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px"
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "#2E3346" }}>
                Recent Bookings
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#646B7C" }}>
                Latest rental reservations across the catalog.
              </p>
            </div>

            <Link
              to="/app/rentals"
              style={{
                fontSize: "13px",
                fontWeight: "600",
                color: "#7964FF",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span>View All Rentals</span>
              <span>➔</span>
            </Link>
          </div>

          {recentRentals.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: "#646B7C" }}>
              <span style={{ fontSize: "42px", display: "block", marginBottom: "12px" }}>👗</span>
              <strong style={{ fontSize: "16px", color: "#2E3346", display: "block", marginBottom: "6px" }}>
                No Bookings in this Filter Period
              </strong>
              <p style={{ margin: "0 0 18px", fontSize: "13.5px" }}>
                Create your first rental booking or switch the filter period above.
              </p>
              <Link to="/app/rentals/new" className="gm-btn-primary">
                + Create First Rental
              </Link>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="gm-table">
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Customer</th>
                    <th>Product / Outfit</th>
                    <th>Pickup Date</th>
                    <th>Return Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRentals.map((r) => {
                    const statusBg =
                      r.status === "CONFIRMED" ? "#ECFDF5" :
                      r.status === "ACTIVE" || r.status === "PICKED_UP" ? "#EFF6FF" :
                      r.status === "COMPLETED" || r.status === "RETURNED" ? "#F3F4F6" :
                      r.status === "CANCELLED" ? "#FEF2F2" : "#FFF7ED";

                    const statusColor =
                      r.status === "CONFIRMED" ? "#059669" :
                      r.status === "ACTIVE" || r.status === "PICKED_UP" ? "#2563EB" :
                      r.status === "COMPLETED" || r.status === "RETURNED" ? "#4B5563" :
                      r.status === "CANCELLED" ? "#DC2626" : "#D97706";

                    const statusBorder =
                      r.status === "CONFIRMED" ? "#A7F3D0" :
                      r.status === "ACTIVE" || r.status === "PICKED_UP" ? "#BFDBFE" :
                      r.status === "COMPLETED" || r.status === "RETURNED" ? "#E5E7EB" :
                      r.status === "CANCELLED" ? "#FECACA" : "#FED7AA";

                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: "700" }}>
                          <Link
                            to={`/app/rentals/${r.id}`}
                            style={{ color: "#7964FF", textDecoration: "none" }}
                          >
                            {r.bookingId || r.id.slice(-8)}
                          </Link>
                        </td>
                        <td>
                          <div style={{ fontWeight: "600", color: "#2E3346" }}>{r.customerName}</div>
                          <div style={{ fontSize: "12px", color: "#646B7C" }}>{r.customerPhone || "No phone"}</div>
                        </td>
                        <td style={{ fontWeight: "500" }}>{r.productTitle}</td>
                        <td style={{ fontWeight: "600" }}>{new Date(r.pickupDate).toLocaleDateString("en-IN")}</td>
                        <td style={{ fontWeight: "600" }}>{new Date(r.returnDate).toLocaleDateString("en-IN")}</td>
                        <td style={{ fontWeight: "700", color: "#2E3346" }}>₹{r.rentalPrice}</td>
                        <td>
                          <span
                            className="gm-status-pill"
                            style={{
                              backgroundColor: statusBg,
                              color: statusColor,
                              border: `1px solid ${statusBorder}`,
                            }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link
                            to={`/app/rentals/${r.id}`}
                            style={{
                              backgroundColor: "#F0EEFF",
                              color: "#7964FF",
                              border: "1px solid #D8D2FF",
                              padding: "6px 14px",
                              borderRadius: "8px",
                              fontSize: "12.5px",
                              fontWeight: "600",
                              textDecoration: "none",
                              display: "inline-block",
                              transition: "all 0.15s ease",
                            }}
                          >
                            View ➔
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 5. Quick Actions Bar */}
        <div>
          <h3 className="gm-section-title">
            <span>⚡</span>
            <span>Quick Operations & Shortcuts</span>
          </h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
            width: "100%"
          }}>
            <Link to="/app/rentals/new" className="gm-action-pill-btn">
              <span style={{ fontSize: "18px" }}>➕</span>
              <span>New Rental Booking</span>
            </Link>

            <Link to="/app/availability" className="gm-action-pill-btn">
              <span style={{ fontSize: "18px" }}>🔒</span>
              <span>Availability & Blocker</span>
            </Link>

            <Link to="/app/calendar" className="gm-action-pill-btn">
              <span style={{ fontSize: "18px" }}>📅</span>
              <span>Rental Visual Calendar</span>
            </Link>

            <Link to="/app/products" className="gm-action-pill-btn">
              <span style={{ fontSize: "18px" }}>👗</span>
              <span>Manage Products & Rates</span>
            </Link>

            <Link to="/app/rentals" className="gm-action-pill-btn">
              <span style={{ fontSize: "18px" }}>📋</span>
              <span>View All Rentals</span>
            </Link>
          </div>
        </div>

      </div>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};