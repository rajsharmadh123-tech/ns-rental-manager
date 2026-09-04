import { useLoaderData, useSubmit, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const query = url.searchParams.get("query") || "";

  const where = {
    shop: session.shop,
  };

  if (query.trim() !== "") {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.customer.findMany({
    where,
    include: {
      rentals: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  // Calculate customer summary stats
  const customerStats = customers.map((c) => {
    let totalRentals = c.rentals.length;
    let activeRentals = 0;
    let completedRentals = 0;
    let totalRevenue = 0;
    let outstandingAmount = 0;

    for (const r of c.rentals) {
      if (r.status === "ACTIVE" || r.status === "PICKED_UP" || r.status === "CONFIRMED" || r.status === "READY_FOR_PICKUP") {
        activeRentals++;
      }
      if (r.status === "COMPLETED" || r.status === "RETURNED") {
        completedRentals++;
      }
      if (r.status !== "CANCELLED") {
        totalRevenue += r.finalAmount || r.rentalPrice || 0;
        if (r.paymentStatus === "UNPAID" || r.paymentStatus === "PARTIAL") {
          outstandingAmount += (r.finalAmount || r.rentalPrice || 0);
        }
      }
    }

    return {
      ...c,
      totalRentals,
      activeRentals,
      completedRentals,
      totalRevenue,
      outstandingAmount,
    };
  });

  return {
    customers: customerStats,
    query,
  };
};

export default function CustomerDirectory() {
  const { customers, query } = useLoaderData();
  const submit = useSubmit();

  const handleSearch = (e) => {
    submit(e.target.form, { method: "get" });
  };

  return (
    <s-page heading="Customer Directory">

      {/* Search Bar */}
      <s-section>
        <form onChange={handleSearch} style={{ width: "100%" }}>
          <s-stack direction="inline" justify="space-between" align="center">
            <div style={{ flex: "1" }}>
              <input
                type="text"
                name="query"
                defaultValue={query}
                placeholder="Search customers by Name, Phone or Email..."
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
          </s-stack>
        </form>
      </s-section>

      {/* Customer List Table */}
      <s-section heading={`Customers (${customers.length})`}>
        {customers.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No customer profiles found.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "12px 10px" }}>Customer Name</th>
                  <th style={{ padding: "12px 10px" }}>Contact</th>
                  <th style={{ padding: "12px 10px" }}>Total Rentals</th>
                  <th style={{ padding: "12px 10px" }}>Active</th>
                  <th style={{ padding: "12px 10px" }}>Completed</th>
                  <th style={{ padding: "12px 10px" }}>Total Revenue</th>
                  <th style={{ padding: "12px 10px" }}>Outstanding</th>
                  <th style={{ padding: "12px 10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "10px", fontWeight: "600" }}>
                      <Link to={`/app/customers/${c.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                        {c.name}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <div>{c.phone}</div>
                      {c.email && <div style={{ fontSize: "12px", color: "#666" }}>{c.email}</div>}
                    </td>
                    <td style={{ padding: "10px", fontWeight: "600" }}>{c.totalRentals}</td>
                    <td style={{ padding: "10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "4px", backgroundColor: "#e0f2fe", color: "#0369a1", fontSize: "12px", fontWeight: "600" }}>
                        {c.activeRentals}
                      </span>
                    </td>
                    <td style={{ padding: "10px" }}>{c.completedRentals}</td>
                    <td style={{ padding: "10px", fontWeight: "600", color: "#16803c" }}>
                      ₹{c.totalRevenue.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "10px", fontWeight: "600", color: c.outstandingAmount > 0 ? "#b00020" : "#666" }}>
                      ₹{c.outstandingAmount.toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <s-button href={`/app/customers/${c.id}`} variant="secondary">Profile & History</s-button>
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
