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

  let blocks = [];
  try {
    blocks = await prisma.availabilityBlock.findMany({
      where: {
        shop: session.shop,
        status: "ACTIVE",
        ...(productFilter !== "ALL" ? { productTitle: productFilter } : {}),
      },
      orderBy: { startDate: "asc" },
    });
  } catch (e) {}

  const rentals = await prisma.rental.findMany({
    where,
    orderBy: { pickupDate: "asc" },
  });

  // Fetch unique products for filter dropdown
  const uniqueProducts = Array.from(new Set(rentals.map((r) => r.productTitle)));

  return {
    rentals,
    blocks,
    viewMode,
    statusFilter,
    productFilter,
    search,
    baseDateStr: baseDate.toISOString().split("T")[0],
    uniqueProducts,
  };
};

export default function RentalCalendar() {
  const { rentals, blocks, viewMode, statusFilter, productFilter, search, baseDateStr, uniqueProducts } = useLoaderData();
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
    <s-page heading="Rental Visual Calendar" inline-size="large">

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

      {/* Availability Status Color Legend */}
      <s-section>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", fontSize: "12px", padding: "10px 14px", backgroundColor: "#FFFFFF", borderRadius: "8px", border: "1px solid #E2E4EB" }}>
          <strong style={{ color: "#2E3346" }}>Status Legend:</strong>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#16a34a" }}></span> 🟢 Available</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#ef4444" }}></span> 🔴 Customer Booking</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#f97316" }}></span> 🟠 Offline Booking</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#3b82f6" }}></span> 🔵 Cleaning</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#a855f7" }}></span> 🟣 Alteration</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#374151" }}></span> ⚫ Maintenance</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#eab308" }}></span> 🟡 Customer Hold</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#b91c1c" }}></span> 🔴 Damaged/Lost</span>
        </div>
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

              const dayBlocks = (blocks || []).filter((b) => {
                const s = new Date(b.startDate);
                const e = new Date(b.endDate);
                return s <= dayEnd && e >= dayStart;
              });

              const allDayEvents = [
                ...dayRentals.map((r) => {
                  const isPickupDay = new Date(r.pickupDate).toDateString() === day.toDateString();
                  const isReturnDay = new Date(r.returnDate).toDateString() === day.toDateString();
                  const icon = isPickupDay ? "📦 " : isReturnDay ? "🔄 " : r.status === "OFFLINE_BOOKED" ? "🏬 " : "🔴 ";
                  return {
                    id: r.id,
                    link: `/app/rentals/${r.id}`,
                    label: `${icon}${r.bookingId || r.customerName}: ${r.productTitle}`,
                    tooltip: `${r.status === "OFFLINE_BOOKED" ? "In-Store Booking" : "Rental"}: ${r.productTitle} (${r.customerName})`,
                    bg: r.status === "OFFLINE_BOOKED" ? "#ffedd5" : r.status === "CONFIRMED" ? "#e3f5e1" : "#fee2e2",
                    color: r.status === "OFFLINE_BOOKED" ? "#c2410c" : r.status === "CONFIRMED" ? "#166534" : "#b91c1c",
                  };
                }),
                ...dayBlocks.map((b) => {
                  let bg = "#f1f5f9";
                  let color = "#475569";
                  let icon = "🔒 ";
                  if (b.reason === "CLEANING") { bg = "#dbeafe"; color = "#1d4ed8"; icon = "🔵 🧼 "; }
                  else if (b.reason === "ALTERATION") { bg = "#f3e8ff"; color = "#7e22ce"; icon = "🟣 ✂️ "; }
                  else if (b.reason === "MAINTENANCE") { bg = "#f3f4f6"; color = "#1f2937"; icon = "⚫ 🔧 "; }
                  else if (b.reason === "CUSTOMER_HOLD") { bg = "#fef9c3"; color = "#a16207"; icon = "🟡 ⏳ "; }
                  else if (b.reason === "DAMAGED" || b.reason === "LOST") { bg = "#fee2e2"; color = "#b91c1c"; icon = "🔴 ⚠️ "; }
                  else if (b.reason === "OFFLINE_BOOKING") { bg = "#ffedd5"; color = "#c2410c"; icon = "🟠 🏬 "; }

                  return {
                    id: b.id,
                    link: `/app/availability?productId=${encodeURIComponent(b.productId)}`,
                    label: `${icon}${b.productTitle || b.productId}`,
                    tooltip: `Blocked (${b.reason}): ${b.productTitle || b.productId} - ${b.internalNote || ""}`,
                    bg,
                    color,
                  };
                }),
              ];

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
                    {allDayEvents.slice(0, 3).map((ev) => (
                      <Link
                        key={ev.id}
                        to={ev.link}
                        title={ev.tooltip}
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
                          backgroundColor: ev.bg,
                          color: ev.color,
                        }}
                      >
                        {ev.label}
                      </Link>
                    ))}

                    {allDayEvents.length > 3 && (
                      <div style={{ fontSize: "10px", color: "#666", fontWeight: "600" }}>
                        +{allDayEvents.length - 3} more
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
