import prisma from "../db.server.js";

/**
 * Generates a unique booking ID in format GM-YYYY-0001
 */
export async function generateBookingId(shop) {
  const currentYear = new Date().getFullYear();
  const prefix = `GM-${currentYear}-`;

  const count = await prisma.rental.count({
    where: {
      shop,
      bookingId: {
        startsWith: prefix,
      },
    },
  });

  const nextNumber = count + 1;
  const formattedNumber = String(nextNumber).padStart(4, "0");
  return `${prefix}${formattedNumber}`;
}

/**
 * Calculates dashboard metrics for the given shop and date filter range
 */
export async function getDashboardMetrics(shop, filter = "month", customStart = null, customEnd = null) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  // Reset times
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  if (filter === "today") {
    // startDate and endDate are today
  } else if (filter === "week") {
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);
    endDate.setDate(startDate.getDate() + 6);
  } else if (filter === "month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (filter === "custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
  }

  const whereShop = { shop };

  const rentals = await prisma.rental.findMany({
    where: whereShop,
    orderBy: { createdAt: "desc" },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  let todaysRentals = 0;
  let upcomingPickups = 0;
  let todaysReturns = 0;
  let overdueReturns = 0;
  let pendingBookings = 0;
  let confirmedBookings = 0;
  let activeRentals = 0;
  let completedRentals = 0;
  let cancelledRentals = 0;
  let totalRevenue = 0;
  let securityDepositsHeld = 0;
  let pendingPayments = 0;

  for (const r of rentals) {
    const pDate = new Date(r.pickupDate);
    const rDate = new Date(r.returnDate);

    // Status counts
    if (r.status === "PENDING") pendingBookings++;
    if (r.status === "CONFIRMED") confirmedBookings++;
    if (r.status === "ACTIVE" || r.status === "PICKED_UP") activeRentals++;
    if (r.status === "COMPLETED" || r.status === "RETURNED") completedRentals++;
    if (r.status === "CANCELLED") cancelledRentals++;

    // Today's Rentals (Pickup or Created today)
    if (pDate >= todayStart && pDate <= todayEnd) todaysRentals++;

    // Upcoming Pickups
    if (pDate > todayEnd && (r.status === "CONFIRMED" || r.status === "PENDING" || r.status === "READY_FOR_PICKUP")) {
      upcomingPickups++;
    }

    // Today's Returns
    if (rDate >= todayStart && rDate <= todayEnd && r.status !== "RETURNED" && r.status !== "COMPLETED") {
      todaysReturns++;
    }

    // Overdue Returns
    if (rDate < todayStart && r.status !== "RETURNED" && r.status !== "COMPLETED" && r.status !== "CANCELLED") {
      overdueReturns++;
    }

    // Financials
    if (r.status !== "CANCELLED") {
      totalRevenue += r.finalAmount || r.rentalPrice || 0;
      if (r.status === "ACTIVE" || r.status === "PICKED_UP" || r.status === "CONFIRMED" || r.status === "READY_FOR_PICKUP") {
        securityDepositsHeld += r.securityDeposit || 0;
      }
      if (r.paymentStatus === "UNPAID" || r.paymentStatus === "PARTIAL") {
        pendingPayments += (r.finalAmount || r.rentalPrice || 0);
      }
    }
  }

  // Filter recent rentals by selected date filter
  const filteredRentals = rentals.filter((r) => {
    const created = new Date(r.createdAt);
    return created >= startDate && created <= endDate;
  });

  return {
    metrics: {
      todaysRentals,
      upcomingPickups,
      todaysReturns,
      overdueReturns,
      pendingBookings,
      confirmedBookings,
      activeRentals,
      completedRentals,
      cancelledRentals,
      totalRevenue,
      securityDepositsHeld,
      pendingPayments,
      totalBookings: rentals.length,
    },
    recentRentals: filteredRentals.slice(0, 10),
  };
}
