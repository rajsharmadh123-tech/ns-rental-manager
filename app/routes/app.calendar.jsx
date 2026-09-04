import { useState } from "react";
import { useLoaderData, useSubmit, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const viewMode = url.searchParams.get("view") || "month"; // month, week, day
  const statusFilter = url.searchParams.get("status") || "ALL";
  const productFilter = url.searchParams.get("product") || "ALL";
  const search = url.searchParams.get("search") || "";

  // Base date for navigation
  const dateStr = url.searchParams.get("date");
  const baseDate = dateStr ? new Date(dateStr) : new Date();

  const where = {
    shop: session.shop,
  };

  if (statusFilter !== "ALL") {
    where.status = statusFilter;
  }

  if (productFilter !== "ALL") {
    where.productTitle = productFilter;
  }

  if (search.trim() !== "") {
    where.OR = [
      { bookingId: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { productTitle: { contains: search, mode: "insensitive" } },
    ];
  }

  const rentals = await prisma.rental.findMany({
    where,
    orderBy: { pickupDate: "asc" },
  });

  // Fetch unique products for filter dropdown
  const uniqueProducts = Array.from(new Set(rentals.map((r) => r.productTitle)));

  return {
    rentals,
    viewMode,
    statusFilter,
    productFilter,
    search,
    baseDateStr: baseDate.toISOString().split("T")[0],
    uniqueProducts,
  };
};

export default function RentalCalendar() {
  const { rentals, viewMode, statusFilter, productFilter, search, baseDateStr, uniqueProducts } = useLoaderData();
  const submit = useSubmit();

  const [currentDate, setCurrentDate] = useState(new Date(baseDateStr));

  const handleFilterChange = (e) => {
    const form = e.target.form;
    submit(form, { method: "get" });
  };

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

  // Month navigation
  const prevMonth = () => {
    const newD = new Date(year, month - 1, 1);
    setCurrentDate(newD);
  };

  const nextMonth = () => {
    const newD = new Date(year, month + 1, 1);
    setCurrentDate(newD);
  };

  const todayMonth = () => {
    setCurrentDate(new Date());
  };

  // Build Grid Days for Month View
  const calendarDays = [];
  // Empty slots before month start
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <s-page heading="Rental Visual Calendar">

      <s-button slot="primary-action" href="/app/rentals/new">
        + New Booking
      </s-button>

      {/* Filter & Controls Bar */}
      <s-section>
        <form onChange={handleFilterChange} style={{ width: "100%" }}>
          <s-stack direction="inline" gap="base" justify="space-between" align="center">
            
            {/* View Mode & Month Navigation */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                type="button"
                onClick={prevMonth}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: "600" }}
              >
                ‹ Prev
              </button>
              <button
                type="button"
                onClick={todayMonth}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: "600" }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={nextMonth}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontWeight: "600" }}
              >
                Next ›
              </button>

              <span style={{ fontSize: "18px", fontWeight: "700", marginLeft: "10px" }}>
                {monthNames[month]} {year}
              </span>
            </div>

            {/* Filter Controls */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="Filter by customer / product..."
                style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
              />

              <select
                name="status"
                defaultValue={statusFilter}
                style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                <option value="ACTIVE">Active / Picked Up</option>
                <option value="RETURNED">Returned / Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              {uniqueProducts.length > 0 && (
                <select
                  name="product"
                  defaultValue={productFilter}
                  style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
                >
                  <option value="ALL">All Outfits</option>
                  {uniqueProducts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </div>

          </s-stack>
        </form>
      </s-section>

      {/* Calendar Grid */}
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          
          {/* Day Headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "2px solid #eee", paddingBottom: "8px", textAlign: "center", fontWeight: "700", fontSize: "14px", color: "#444" }}>
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", backgroundColor: "#eee", marginTop: "4px" }}>
            {calendarDays.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} style={{ minHeight: "110px", backgroundColor: "#fafafa" }} />;
              }

              const dateNum = day.getDate();
              const isToday =
                day.getDate() === new Date().getDate() &&
                day.getMonth() === new Date().getMonth() &&
                day.getFullYear() === new Date().getFullYear();

              // Find rentals overlapping with this day
              const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
              const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

              const dayRentals = rentals.filter((r) => {
                const p = new Date(r.pickupDate);
                const ret = new Date(r.returnDate);
                return p <= dayEnd && ret >= dayStart;
              });

              return (
                <div
                  key={day.toISOString()}
                  style={{
                    minHeight: "110px",
                    backgroundColor: isToday ? "#f0f7ff" : "#fff",
                    padding: "6px",
                    boxSizing: "border-box",
                    border: isToday ? "2px solid #005bd3" : "none"
                  }}
                >
                  <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px", color: isToday ? "#005bd3" : "#333" }}>
                    {dateNum}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {dayRentals.slice(0, 3).map((r) => {
                      const isPickupDay = new Date(r.pickupDate).toDateString() === day.toDateString();
                      const isReturnDay = new Date(r.returnDate).toDateString() === day.toDateString();

                      return (
                        <Link
                          key={r.id}
                          to={`/app/rentals/${r.id}`}
                          title={`${r.bookingId || r.customerName} - ${r.productTitle} (${r.status})`}
                          style={{
                            display: "block",
                            padding: "3px 6px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "600",
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
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
                          {isPickupDay && "📦 "}
                          {isReturnDay && "🔄 "}
                          {r.bookingId || r.customerName}: {r.productTitle}
                        </Link>
                      );
                    })}

                    {dayRentals.length > 3 && (
                      <div style={{ fontSize: "10px", color: "#666", fontWeight: "600" }}>
                        +{dayRentals.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </s-box>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
