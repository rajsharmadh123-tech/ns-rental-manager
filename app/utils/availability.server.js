import prisma from "../db.server.js";

/**
 * Checks if a product/variant is available for the given date range.
 * 
 * Date Overlap Condition:
 * Two date ranges [P1, R1] and [P2, R2] overlap if:
 * P1 <= R2 AND R1 >= P2
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.productId
 * @param {string} [params.variantId]
 * @param {Date|string} params.pickupDate
 * @param {Date|string} params.returnDate
 * @param {string} [params.excludeRentalId] - Useful when updating an existing booking
 * @returns {Promise<{isAvailable: boolean, conflictingRentals: Array, message: string}>}
 */
export async function checkProductAvailability({
  shop,
  productId,
  variantId = "",
  pickupDate,
  returnDate,
  excludeRentalId = null,
}) {
  const pDate = new Date(pickupDate);
  const rDate = new Date(returnDate);

  if (isNaN(pDate.getTime()) || isNaN(rDate.getTime())) {
    return {
      isAvailable: false,
      conflictingRentals: [],
      message: "Invalid pickup or return date provided.",
    };
  }

  if (rDate < pDate) {
    return {
      isAvailable: false,
      conflictingRentals: [],
      message: "Return date cannot be before pickup date.",
    };
  }

  const where = {
    shop,
    productId,
    status: {
      notIn: ["CANCELLED", "COMPLETED", "RETURNED"],
    },
    pickupDate: {
      lte: rDate,
    },
    returnDate: {
      gte: pDate,
    },
  };

  if (variantId) {
    where.variantId = variantId;
  }

  if (excludeRentalId) {
    where.id = {
      not: excludeRentalId,
    };
  }

  const conflictingRentals = await prisma.rental.findMany({
    where,
    orderBy: { pickupDate: "asc" },
  });

  if (conflictingRentals.length > 0) {
    const firstConflict = conflictingRentals[0];
    const cPickup = new Date(firstConflict.pickupDate).toLocaleDateString("en-IN");
    const cReturn = new Date(firstConflict.returnDate).toLocaleDateString("en-IN");

    return {
      isAvailable: false,
      conflictingRentals,
      message: `Product unavailable for selected dates. Already booked from ${cPickup} to ${cReturn} (${firstConflict.bookingId || "Booking #" + firstConflict.id.slice(-6)}).`,
    };
  }

  return {
    isAvailable: true,
    conflictingRentals: [],
    message: "Product is available for the selected date range.",
  };
}

/**
 * Returns all available rental products for a specified date range.
 */
export async function getAvailableProductsForDates(shop, pickupDate, returnDate) {
  const pDate = new Date(pickupDate);
  const rDate = new Date(returnDate);

  // Find all active bookings in date range
  const activeBookings = await prisma.rental.findMany({
    where: {
      shop,
      status: {
        notIn: ["CANCELLED", "COMPLETED", "RETURNED"],
      },
      pickupDate: {
        lte: rDate,
      },
      returnDate: {
        gte: pDate,
      },
    },
    select: {
      productId: true,
      variantId: true,
    },
  });

  const unavailableProductIds = new Set(activeBookings.map((b) => b.productId));

  return {
    unavailableProductIds: Array.from(unavailableProductIds),
    activeBookingsCount: activeBookings.length,
  };
}
