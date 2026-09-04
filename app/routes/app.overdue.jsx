import { useLoaderData, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Fetch overdue rentals
  const overdueRentals = await prisma.rental.findMany({
    where: {
      shop: session.shop,
      returnDate: {
        lt: todayStart,
      },
      status: {
        notIn: ["RETURNED", "COMPLETED", "CANCELLED"],
      },
    },
    orderBy: { returnDate: "asc" },
  });

  const settings = await prisma.rentalSettings.findUnique({
    where: { shop: session.shop },
  });
  const lateFeeRate = settings?.lateFeePerDay ?? 500;

  // Calculate days overdue and suggested late fee based on configurable late fee rate
  const formattedOverdue = overdueRentals.map((r) => {
    const rDate = new Date(r.returnDate);
    const diffTime = Math.abs(todayStart - rDate);
    const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const suggestedLateFee = daysOverdue * lateFeeRate;

    return {
      ...r,
      daysOverdue,
      suggestedLateFee,
    };
  });

  return { overdueRentals: formattedOverdue };
};

export default function OverdueRentals() {
  const { overdueRentals } = useLoaderData();

  return (
    <s-page heading="Overdue Rentals Tracker">

      <s-section>
        <s-heading>Overdue Return Alerts</s-heading>
        <s-paragraph>
          Rentals past their return date that have not been marked as returned or completed.
        </s-paragraph>
      </s-section>

      <s-section heading={`Overdue Rentals (${overdueRentals.length})`}>
        {overdueRentals.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f0faf4" }}>
            <s-paragraph style={{ color: "#16803c", fontWeight: "600" }}>
              🎉 Excellent! There are no overdue rentals at this time.
            </s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#fff5f5" }}>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Outfit / Product</th>
                  <th style={{ padding: "10px" }}>Expected Return</th>
                  <th style={{ padding: "10px" }}>Days Overdue</th>
                  <th style={{ padding: "10px" }}>Suggested Late Fee</th>
                  <th style={{ padding: "10px" }}>Current Status</th>
                  <th style={{ padding: "10px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {overdueRentals.map((r) => {
                  const returnDateFormatted = new Date(r.returnDate).toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee", backgroundColor: "#fff0f0" }}>
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
                      <td style={{ padding: "10px", fontWeight: "600", color: "#b00020" }}>
                        📅 {returnDateFormatted}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "4px", backgroundColor: "#ffe4e6", color: "#9f1239", fontWeight: "700", fontSize: "12px" }}>
                          ⚠️ {r.daysOverdue} Days Overdue
                        </span>
                      </td>
                      <td style={{ padding: "10px", fontWeight: "600", color: "#b00020" }}>
                        ₹{r.suggestedLateFee.toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "4px", backgroundColor: "#fef3c7", color: "#92400e", fontSize: "12px", fontWeight: "600" }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {r.customerPhone && (
                            <a
                              href={`https://wa.me/${r.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                                `URGENT REMINDER: Hello ${r.customerName}, your rental outfit (${r.productTitle}) for booking ${r.bookingId || r.id.slice(-8)} was due on ${returnDateFormatted} and is now ${r.daysOverdue} days overdue. Applicable late fee: ₹${r.suggestedLateFee}. Please return the outfit to NS Bridal & Groom Collection immediately.`
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
                              💬 Overdue Reminder
                            </a>
                          )}

                          <s-button href="/app/returns" variant="secondary">Process Return</s-button>
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
