import { useLoaderData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const filter = url.searchParams.get("filter") || "month";
  const customStart = url.searchParams.get("customStart");
  const customEnd = url.searchParams.get("customEnd");

  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  if (filter === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (filter === "week") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === "year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  } else if (filter === "custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
  } else if (filter === "all") {
    startDate = new Date(2020, 0, 1);
    endDate = new Date(2035, 11, 31);
  }

  const rentals = await prisma.rental.findMany({
    where: {
      shop: session.shop,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      payments: true,
      customer: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let totalRentals = rentals.length;
  let totalRevenue = 0;
  let securityDepositsCollected = 0;
  let outstandingPayments = 0;
  let totalRefunds = 0;
  let overdueCount = 0;
  let cancelledCount = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Product-wise and Customer-wise Aggregations
  const productMap = {};
  const customerMap = {};

  for (const r of rentals) {
    const finalAmt = r.finalAmount || r.rentalPrice || 0;
    const paid = r.payments ? r.payments.reduce((acc, p) => p.paymentType !== "REFUND" ? acc + p.amount : acc, 0) : 0;
    const refund = r.payments ? r.payments.reduce((acc, p) => p.paymentType === "REFUND" ? acc + p.amount : acc, 0) : 0;
    const balance = Math.max(0, finalAmt - paid);

    if (r.status === "CANCELLED") {
      cancelledCount++;
      continue;
    }

    totalRevenue += finalAmt;
    securityDepositsCollected += (r.securityDeposit || 0);
    outstandingPayments += balance;
    totalRefunds += refund;

    const rDate = new Date(r.returnDate);
    if (rDate < todayStart && r.status !== "RETURNED" && r.status !== "COMPLETED") {
      overdueCount++;
    }

    // Product aggregation
    if (!productMap[r.productTitle]) {
      productMap[r.productTitle] = { title: r.productTitle, count: 0, revenue: 0 };
    }
    productMap[r.productTitle].count += 1;
    productMap[r.productTitle].revenue += finalAmt;

    // Customer aggregation
    const cKey = r.customerName + "_" + r.customerPhone;
    if (!customerMap[cKey]) {
      customerMap[cKey] = { name: r.customerName, phone: r.customerPhone, count: 0, totalSpend: 0, balance: 0 };
    }
    customerMap[cKey].count += 1;
    customerMap[cKey].totalSpend += finalAmt;
    customerMap[cKey].balance += balance;
  }

  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
  const topCustomers = Object.values(customerMap).sort((a, b) => b.totalSpend - a.totalSpend);

  return {
    filter,
    customStart,
    customEnd,
    metrics: {
      totalRentals,
      totalRevenue,
      securityDepositsCollected,
      outstandingPayments,
      totalRefunds,
      overdueCount,
      cancelledCount,
    },
    topProducts,
    topCustomers,
  };
};

export default function ReportsPage() {
  const { filter, customStart, customEnd, metrics, topProducts, topCustomers } = useLoaderData();
  const submit = useSubmit();

  const handleFilterChange = (e) => {
    submit(e.target.form, { method: "get" });
  };

  const exportUrl = `/api/export-csv?filter=${filter}${customStart ? "&customStart=" + customStart : ""}${customEnd ? "&customEnd=" + customEnd : ""}`;

  return (
    <s-page heading="Reports & Business Analytics">

      {/* Primary CSV Export Button */}
      <a
        slot="primary-action"
        href={exportUrl}
        target="_blank"
        rel="noreferrer"
        className="gm-btn-primary"
      >
        📥 Export CSV Report
      </a>

      {/* Date Filter Bar */}
      <s-section>
        <form onChange={handleFilterChange} style={{ width: "100%" }}>
          <s-stack direction="inline" justify="space-between" align="center">
            <div>
              <s-heading>Analytics Overview</s-heading>
              <s-paragraph>Track revenue, product performance, and customer metrics.</s-paragraph>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "14px", fontWeight: "600" }}>Period:</label>
              <select
                name="filter"
                defaultValue={filter}
                style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "14px" }}
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </s-stack>
        </form>
      </s-section>

      {/* Key Metrics Cards */}
      <s-section heading="Summary Metrics">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>{metrics.totalRentals}</s-heading>
            <s-paragraph>Total Bookings</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f0faf4" }}>
            <s-heading style={{ color: "#16803c" }}>₹{metrics.totalRevenue.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Total Rental Revenue</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f4f6fb" }}>
            <s-heading style={{ color: "#005bd3" }}>₹{metrics.securityDepositsCollected.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Deposits Collected</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#fffdf0" }}>
            <s-heading style={{ color: "#9c6d00" }}>₹{metrics.outstandingPayments.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Outstanding Payments</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#fbf2ff" }}>
            <s-heading style={{ color: "#6b21a8" }}>₹{metrics.totalRefunds.toLocaleString("en-IN")}</s-heading>
            <s-paragraph>Refunds Processed</s-paragraph>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: metrics.overdueCount > 0 ? "#fff0f0" : "inherit" }}>
            <s-heading style={{ color: metrics.overdueCount > 0 ? "#b00020" : "inherit" }}>{metrics.overdueCount}</s-heading>
            <s-paragraph style={{ color: metrics.overdueCount > 0 ? "#b00020" : "inherit" }}>Overdue Bookings</s-paragraph>
          </s-box>

        </div>
      </s-section>

      {/* Analytics Tables Grid */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

          {/* Top Outfits */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>👗 Most Rented Outfits</s-heading>
            {topProducts.length === 0 ? (
              <s-paragraph style={{ marginTop: "12px" }}>No product rental data for this period.</s-paragraph>
            ) : (
              <div style={{ overflowX: "auto", marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Outfit Name</th>
                      <th style={{ padding: "8px" }}>Bookings</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.slice(0, 10).map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px", fontWeight: "600" }}>{p.title}</td>
                        <td style={{ padding: "8px" }}>{p.count}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#16803c" }}>
                          ₹{p.revenue.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </s-box>

          {/* Top Customers */}
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-heading>👤 Customer Breakdown</s-heading>
            {topCustomers.length === 0 ? (
              <s-paragraph style={{ marginTop: "12px" }}>No customer data for this period.</s-paragraph>
            ) : (
              <div style={{ overflowX: "auto", marginTop: "12px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                      <th style={{ padding: "8px" }}>Customer</th>
                      <th style={{ padding: "8px" }}>Bookings</th>
                      <th style={{ padding: "8px", textAlign: "right" }}>Total Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.slice(0, 10).map((c, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: "8px" }}>
                          <div style={{ fontWeight: "600" }}>{c.name}</div>
                          <div style={{ fontSize: "11px", color: "#666" }}>{c.phone}</div>
                        </td>
                        <td style={{ padding: "8px" }}>{c.count}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#16803c" }}>
                          ₹{c.totalSpend.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </s-box>

        </div>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
