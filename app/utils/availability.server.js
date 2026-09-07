import prisma from "../db.server.js";
import { formatDisplayDate, formatReasonLabel, getReasonColor } from "./availability.js";
export { formatDisplayDate, formatReasonLabel, getReasonColor } from "./availability.js";

let isTableInitialized = false;

/**
 * Self-healing DB initialization:
 * Ensures AvailabilityBlock & AuditLog tables and buffer columns exist in PostgreSQL.
 */
export async function ensureAvailabilityTablesExist() {
  if (isTableInitialized) return;
  try {
    await prisma.$executeRawUnsafe(`
      -- Alter RentalProductConfig columns if missing
      ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "cleaningBufferDays" INTEGER;
      ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "isDamaged" BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE "RentalProductConfig" ADD COLUMN IF NOT EXISTS "isLost" BOOLEAN NOT NULL DEFAULT false;

      -- Alter RentalSettings columns if missing
      ALTER TABLE "RentalSettings" ADD COLUMN IF NOT EXISTS "cleaningBufferDays" INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE "RentalSettings" ADD COLUMN IF NOT EXISTS "alterationBufferDays" INTEGER NOT NULL DEFAULT 0;

      -- Create AvailabilityBlock table if missing
      CREATE TABLE IF NOT EXISTS "AvailabilityBlock" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "productId" TEXT NOT NULL,
          "productTitle" TEXT,
          "variantId" TEXT DEFAULT '',
          "startDate" TIMESTAMP(3) NOT NULL,
          "endDate" TIMESTAMP(3) NOT NULL,
          "reason" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'ACTIVE',
          "customerName" TEXT,
          "customerPhone" TEXT,
          "internalNote" TEXT,
          "createdBy" TEXT DEFAULT 'Admin',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
      );

      -- Create indexes if missing
      CREATE INDEX IF NOT EXISTS "AvailabilityBlock_shop_productId_startDate_endDate_idx" ON "AvailabilityBlock"("shop", "productId", "startDate", "endDate");
      CREATE INDEX IF NOT EXISTS "AvailabilityBlock_shop_status_idx" ON "AvailabilityBlock"("shop", "status");

      -- Create AuditLog table if missing
      CREATE TABLE IF NOT EXISTS "AuditLog" (
          "id" TEXT NOT NULL,
          "shop" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT NOT NULL,
          "details" TEXT,
          "performedBy" TEXT NOT NULL DEFAULT 'Admin',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "AuditLog_shop_entityType_entityId_idx" ON "AuditLog"("shop", "entityType", "entityId");
    `);
    isTableInitialized = true;
  } catch (err) {
    console.warn("⚠️ Notice while ensuring availability tables exist:", err?.message);
  }
}

/**
 * Normalizes an incoming date to YYYY-MM-DD midnight in local/UTC calculation
 */
function normalizeDate(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Central Availability Engine for NS Rental Manager
 * 
 * Single source of truth for both Storefront and Admin.
 * Handles:
 * - Customer Online Bookings (Rental)
 * - In-Store / Offline Bookings
 * - Manual Availability Blocks (Cleaning, Alteration, Maintenance, Hold, Damage, Lost)
 * - Automatic Return & Cleaning Buffer Days
 * - Product Global Enabled/Disabled/Damaged/Lost Status
 * - Strict Customer Privacy vs Full Admin Transparency
 */
export async function checkProductAvailability({
  shop,
  productId,
  variantId = "",
  pickupDate,
  returnDate,
  excludeRentalId = null,
  excludeBlockId = null,
  isStorefront = false,
}) {
  const pDate = normalizeDate(pickupDate);
  const rDate = normalizeDate(returnDate);

  // 1. Validate date input
  if (!pDate || !rDate) {
    return {
      isAvailable: false,
      conflicts: [],
      message: isStorefront ? "Unavailable for selected date" : "Invalid pickup or return date provided.",
    };
  }

  if (rDate < pDate) {
    return {
      isAvailable: false,
      conflicts: [],
      message: isStorefront ? "Unavailable for selected date" : "Return date cannot be before pickup date.",
    };
  }

  const conflicts = [];
  const cleanProductId = String(productId).replace("gid://shopify/Product/", "");

  // 2. Check Global Product Status & Config
  let pConfig = null;
  let settings = null;

  try {
    [pConfig, settings] = await Promise.all([
      prisma.rentalProductConfig.findFirst({
        where: {
          shop,
          productId: { contains: cleanProductId },
        },
      }),
      prisma.rentalSettings.findUnique({
        where: { shop },
      }),
    ]);
  } catch (err) {
    console.warn("Could not query config in availability check:", err);
  }

  // Check if globally disabled / out of service
  if (pConfig) {
    if (pConfig.isEnabled === false) {
      if (isStorefront) {
        return {
          isAvailable: false,
          conflicts: [],
          message: "Unavailable for selected date",
        };
      }
      return {
        isAvailable: false,
        conflicts: [{
          id: "config-disabled",
          type: "DISABLED",
          reason: "OUT_OF_SERVICE",
          title: "Product Disabled",
          notes: "Product is disabled / out of service in Rental Product configurations.",
        }],
        message: "This product is currently marked as Out of Service / Disabled for rent.",
      };
    }

    if (pConfig.isDamaged) {
      if (isStorefront) {
        return {
          isAvailable: false,
          conflicts: [],
          message: "Unavailable for selected date",
        };
      }
      return {
        isAvailable: false,
        conflicts: [{
          id: "config-damaged",
          type: "DAMAGED",
          reason: "DAMAGED",
          title: "Damaged / Under Repair",
          notes: "Product is flagged as damaged and awaiting restoration.",
        }],
        message: "Product is marked DAMAGED and unavailable for booking.",
      };
    }

    if (pConfig.isLost) {
      if (isStorefront) {
        return {
          isAvailable: false,
          conflicts: [],
          message: "Unavailable for selected date",
        };
      }
      return {
        isAvailable: false,
        conflicts: [{
          id: "config-lost",
          type: "LOST",
          reason: "LOST",
          title: "Lost Inventory",
          notes: "Product is flagged as lost.",
        }],
        message: "Product is marked LOST and unavailable for booking.",
      };
    }
  }

  // Determine cleaning buffer days (per-product override or shop default, default to 1 day)
  const cleaningBufferDays = pConfig?.cleaningBufferDays ?? settings?.cleaningBufferDays ?? 1;
  const bufferMs = cleaningBufferDays * 24 * 60 * 60 * 1000;

  // 3. Query Active Rental Bookings (Online & Offline)
  try {
    const rentalWhere = {
      shop,
      productId: { contains: cleanProductId },
      status: {
        notIn: ["CANCELLED", "COMPLETED", "RETURNED"],
      },
      pickupDate: {
        lte: rDate,
      },
      returnDate: {
        gte: new Date(pDate.getTime() - bufferMs),
      },
    };

    if (variantId) {
      rentalWhere.variantId = variantId;
    }

    if (excludeRentalId) {
      rentalWhere.id = { not: excludeRentalId };
    }

    const activeRentals = await prisma.rental.findMany({
      where: rentalWhere,
      orderBy: { pickupDate: "asc" },
    });

    for (const rental of activeRentals) {
      const rPickup = new Date(rental.pickupDate);
      const rReturn = new Date(rental.returnDate);
      const rEffectiveReturn = new Date(rReturn.getTime() + bufferMs);

      // Check overlap with rental duration
      if (rPickup <= rDate && rReturn >= pDate) {
        conflicts.push({
          id: rental.id,
          bookingId: rental.bookingId || "GM-" + rental.id.slice(-6),
          type: rental.status === "OFFLINE_BOOKED" ? "OFFLINE_BOOKING" : "RENTAL",
          reason: rental.status === "OFFLINE_BOOKED" ? "In-Store / Offline Booking" : "Customer Rental Booking",
          startDate: rPickup,
          endDate: rReturn,
          customerName: rental.customerName,
          customerPhone: rental.customerPhone,
          notes: rental.notes || "",
          status: rental.status,
        });
      }
      // Check overlap with post-rental cleaning buffer
      else if (cleaningBufferDays > 0 && rReturn < pDate && rEffectiveReturn >= pDate && rPickup <= rDate) {
        conflicts.push({
          id: `buffer-${rental.id}`,
          bookingId: rental.bookingId || "GM-" + rental.id.slice(-6),
          type: "BUFFER",
          reason: "Return & Cleaning Buffer",
          startDate: new Date(rReturn.getTime() + 86400000), // Day after return
          endDate: rEffectiveReturn,
          customerName: "Store Operations",
          customerPhone: "",
          notes: `Automatic ${cleaningBufferDays}-day cleaning buffer following Booking ${rental.bookingId || rental.id.slice(-6)}`,
          status: "BUFFER",
        });
      }
    }
  } catch (rentalErr) {
    console.warn("Error querying rentals in availability check:", rentalErr);
  }

  // 4. Query Manual Availability Blocks (Cleaning, Alteration, Maintenance, Hold, Damage, etc.)
  try {
    await ensureAvailabilityTablesExist();
    const blockWhere = {
      shop,
      productId: { contains: cleanProductId },
      status: "ACTIVE",
      startDate: {
        lte: rDate,
      },
      endDate: {
        gte: pDate,
      },
    };

    if (variantId) {
      blockWhere.variantId = variantId;
    }

    if (excludeBlockId) {
      blockWhere.id = { not: excludeBlockId };
    }

    let activeBlocks = [];
    try {
      activeBlocks = await prisma.availabilityBlock.findMany({
        where: blockWhere,
        orderBy: { startDate: "asc" },
      });
    } catch (findErr) {
      try {
        activeBlocks = await prisma.$queryRawUnsafe(
          `SELECT * FROM "AvailabilityBlock"
           WHERE "shop" = $1 AND "productId" LIKE $2 AND "status" = 'ACTIVE'
           AND "startDate" <= $3 AND "endDate" >= $4
           ORDER BY "startDate" ASC`,
          shop,
          `%${cleanProductId}%`,
          rDate,
          pDate
        );
      } catch (rawErr) {
        console.warn("AvailabilityBlock raw query skipped:", rawErr?.message);
      }
    }

    for (const block of (activeBlocks || [])) {
      conflicts.push({
        id: block.id,
        bookingId: `BLK-${String(block.id).slice(-6).toUpperCase()}`,
        type: "BLOCK",
        reason: block.reason,
        startDate: new Date(block.startDate),
        endDate: new Date(block.endDate),
        customerName: block.customerName || "Store Staff",
        customerPhone: block.customerPhone || "",
        notes: block.internalNote || "",
        createdBy: block.createdBy || "Admin",
        status: block.status,
      });
    }
  } catch (blockErr) {
    console.warn("AvailabilityBlock table query skipped or empty:", blockErr?.message);
  }

  // 5. Build Sanitized vs Detailed Response
  const hasConflicts = conflicts.length > 0;

  if (hasConflicts) {
    // CUSTOMER / STOREFRONT: STRICT PRIVACY RULE
    // Customer NEVER sees reason, customer details, notes, staff name, or booking IDs
    if (isStorefront) {
      return {
        isAvailable: false,
        conflicts: [],
        message: "Unavailable for selected date",
      };
    }

    // ADMIN: FULL OPERATIONAL TRANSPARENCY
    const firstConflict = conflicts[0];
    const cStart = formatDisplayDate(firstConflict.startDate);
    const cEnd = formatDisplayDate(firstConflict.endDate);
    const reasonLabel = formatReasonLabel(firstConflict.reason || firstConflict.type);

    return {
      isAvailable: false,
      conflicts,
      message: `Product unavailable: Conflicted with ${reasonLabel} from ${cStart} to ${cEnd}.`,
    };
  }

  return {
    isAvailable: true,
    conflicts: [],
    message: isStorefront ? "Available for selected date" : "Product is available for the selected date range.",
  };
}

/**
 * Generates unified chronological timeline segments for an outfit
 * (Bookings, Buffers, Offline Bookings, Cleaning, Alteration, Maintenance, Free slots)
 */
export async function getProductTimeline(shop, productId, fromDate, toDate) {
  const cleanProductId = String(productId).replace("gid://shopify/Product/", "");
  const fDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 86400000);
  const tDate = toDate ? new Date(toDate) : new Date(Date.now() + 60 * 86400000);

  const timelineItems = [];

  // 1. Fetch rentals
  try {
    const rentals = await prisma.rental.findMany({
      where: {
        shop,
        productId: { contains: cleanProductId },
        status: { notIn: ["CANCELLED"] },
        returnDate: { gte: fDate },
        pickupDate: { lte: tDate },
      },
      orderBy: { pickupDate: "asc" },
    });

    for (const r of rentals) {
      timelineItems.push({
        id: r.id,
        bookingId: r.bookingId || "GM-" + r.id.slice(-6),
        category: r.status === "OFFLINE_BOOKED" ? "OFFLINE_BOOKING" : "CUSTOMER_BOOKING",
        title: `${r.status === "OFFLINE_BOOKED" ? "In-Store Booking" : "Online Rental"}: ${r.customerName}`,
        startDate: r.pickupDate,
        endDate: r.returnDate,
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        notes: r.notes || "",
        status: r.status,
        color: r.status === "OFFLINE_BOOKED" ? "#f97316" : "#ef4444", // Orange vs Red
      });
    }
  } catch (e) {}

  // 2. Fetch blocks
  try {
    const blocks = await prisma.availabilityBlock.findMany({
      where: {
        shop,
        productId: { contains: cleanProductId },
        status: "ACTIVE",
        endDate: { gte: fDate },
        startDate: { lte: tDate },
      },
      orderBy: { startDate: "asc" },
    });

    for (const b of blocks) {
      const color = getReasonColor(b.reason);
      timelineItems.push({
        id: b.id,
        bookingId: `BLK-${b.id.slice(-6).toUpperCase()}`,
        category: b.reason,
        title: `${formatReasonLabel(b.reason)}${b.customerName ? ` (${b.customerName})` : ""}`,
        startDate: b.startDate,
        endDate: b.endDate,
        customerName: b.customerName || "",
        customerPhone: b.customerPhone || "",
        notes: b.internalNote || "",
        status: b.status,
        color: color,
      });
    }
  } catch (e) {}

  // Sort chronological
  timelineItems.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  return timelineItems;
}

/**
 * Returns available vs booked vs blocked products for a date range
 */
export async function getAvailableProductsForDates(shop, pickupDate, returnDate) {
  const pDate = new Date(pickupDate);
  const rDate = new Date(returnDate);

  const unavailableProductIds = new Set();
  const bookedProductIds = new Set();
  const blockedProductIds = new Set();

  try {
    // Active rentals
    const activeRentals = await prisma.rental.findMany({
      where: {
        shop,
        status: { notIn: ["CANCELLED", "COMPLETED", "RETURNED"] },
        pickupDate: { lte: rDate },
        returnDate: { gte: pDate },
      },
      select: { productId: true },
    });
    for (const r of activeRentals) {
      unavailableProductIds.add(r.productId);
      bookedProductIds.add(r.productId);
    }

    // Active blocks
    const activeBlocks = await prisma.availabilityBlock.findMany({
      where: {
        shop,
        status: "ACTIVE",
        startDate: { lte: rDate },
        endDate: { gte: pDate },
      },
      select: { productId: true },
    });
    for (const b of activeBlocks) {
      unavailableProductIds.add(b.productId);
      blockedProductIds.add(b.productId);
    }
  } catch (e) {}

  return {
    unavailableProductIds: Array.from(unavailableProductIds),
    bookedProductIds: Array.from(bookedProductIds),
    blockedProductIds: Array.from(blockedProductIds),
  };
}

/**
 * Creates an AvailabilityBlock and logs an audit record
 */
export async function createAvailabilityBlock({
  shop,
  productId,
  productTitle = "",
  variantId = "",
  startDate,
  endDate,
  reason,
  customerName = null,
  customerPhone = null,
  internalNote = null,
  createdBy = "Admin",
}) {
  await ensureAvailabilityTablesExist();
  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  if (!sDate || !eDate) {
    throw new Error("Invalid start or end date.");
  }
  if (eDate < sDate) {
    throw new Error("End date cannot be before start date.");
  }

  const cleanProductId = String(productId).replace("gid://shopify/Product/", "");
  const blockId = "blk_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  let block;
  try {
    block = await prisma.availabilityBlock.create({
      data: {
        shop,
        productId: cleanProductId,
        productTitle,
        variantId: variantId || "",
        startDate: sDate,
        endDate: eDate,
        reason,
        status: "ACTIVE",
        customerName,
        customerPhone,
        internalNote,
        createdBy,
      },
    });
  } catch (err) {
    console.warn("prisma.availabilityBlock.create fallback to raw SQL:", err?.message);
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AvailabilityBlock" ("id", "shop", "productId", "productTitle", "variantId", "startDate", "endDate", "reason", "status", "customerName", "customerPhone", "internalNote", "createdBy", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        blockId,
        shop,
        cleanProductId,
        productTitle,
        variantId || "",
        sDate,
        eDate,
        reason,
        "ACTIVE",
        customerName,
        customerPhone,
        internalNote,
        createdBy
      );
      block = {
        id: blockId,
        shop,
        productId: cleanProductId,
        productTitle,
        variantId: variantId || "",
        startDate: sDate,
        endDate: eDate,
        reason,
        status: "ACTIVE",
        customerName,
        customerPhone,
        internalNote,
        createdBy,
      };
    } catch (rawErr) {
      console.error("Critical error creating availability block in raw SQL:", rawErr);
      throw new Error(`Failed to block dates: ${rawErr.message}`);
    }
  }

  // Audit log (never throws)
  await logAuditAction({
    shop,
    action: "BLOCK_CREATED",
    entityType: "AVAILABILITY_BLOCK",
    entityId: block.id,
    details: `Blocked ${productTitle || cleanProductId} from ${formatDisplayDate(sDate)} to ${formatDisplayDate(eDate)} for ${formatReasonLabel(reason)}. Note: ${internalNote || "None"}`,
    performedBy: createdBy,
  });

  return block;
}

/**
 * Cancels/unblocks an availability block and logs an audit record
 */
export async function unblockAvailabilityBlock(shop, blockId, performedBy = "Admin") {
  await ensureAvailabilityTablesExist();

  let block = null;
  try {
    block = await prisma.availabilityBlock.findUnique({
      where: { id: blockId },
    });
  } catch (e) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT * FROM "AvailabilityBlock" WHERE "id" = $1 LIMIT 1`,
        blockId
      );
      block = rows?.[0] || null;
    } catch (rawErr) {
      console.warn("Raw block query failed:", rawErr?.message);
    }
  }

  if (!block || block.shop !== shop) {
    throw new Error("Availability block not found.");
  }

  try {
    await prisma.availabilityBlock.update({
      where: { id: blockId },
      data: { status: "CANCELLED" },
    });
  } catch (e) {
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "AvailabilityBlock" SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        blockId
      );
    } catch (rawErr) {
      console.error("Failed to cancel block in raw SQL:", rawErr);
      throw new Error(`Failed to unblock dates: ${rawErr.message}`);
    }
  }

  await logAuditAction({
    shop,
    action: "BLOCK_CANCELLED",
    entityType: "AVAILABILITY_BLOCK",
    entityId: blockId,
    details: `Unblocked ${block.productTitle || block.productId} for dates ${formatDisplayDate(block.startDate)} - ${formatDisplayDate(block.endDate)} (${formatReasonLabel(block.reason)})`,
    performedBy,
  });

  return { success: true };
}

/**
 * Bulk creates availability blocks across multiple products
 */
export async function bulkCreateAvailabilityBlocks({
  shop,
  productIds,
  productTitlesMap = {},
  startDate,
  endDate,
  reason,
  internalNote = null,
  createdBy = "Admin",
}) {
  await ensureAvailabilityTablesExist();
  const sDate = normalizeDate(startDate);
  const eDate = normalizeDate(endDate);

  if (!sDate || !eDate || eDate < sDate) {
    throw new Error("Invalid start or end date range.");
  }

  const createdBlocks = [];

  for (const pid of productIds) {
    const cleanId = String(pid).replace("gid://shopify/Product/", "");
    const title = productTitlesMap[pid] || "Product " + cleanId;
    const blockId = "blk_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

    try {
      const block = await prisma.availabilityBlock.create({
        data: {
          shop,
          productId: cleanId,
          productTitle: title,
          startDate: sDate,
          endDate: eDate,
          reason,
          status: "ACTIVE",
          internalNote,
          createdBy,
        },
      });
      createdBlocks.push(block);
    } catch (e) {
      try {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "AvailabilityBlock" ("id", "shop", "productId", "productTitle", "variantId", "startDate", "endDate", "reason", "status", "internalNote", "createdBy", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, '', $5, $6, $7, 'ACTIVE', $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          blockId,
          shop,
          cleanId,
          title,
          sDate,
          eDate,
          reason,
          internalNote,
          createdBy
        );
        createdBlocks.push({ id: blockId, productId: cleanId, productTitle: title });
      } catch (rawErr) {
        console.warn("Failed bulk insert for product:", cleanId, rawErr?.message);
      }
    }
  }

  await logAuditAction({
    shop,
    action: "BULK_BLOCK_CREATED",
    entityType: "AVAILABILITY_BLOCK",
    entityId: `${createdBlocks.length}-products`,
    details: `Bulk blocked ${createdBlocks.length} products from ${formatDisplayDate(sDate)} to ${formatDisplayDate(eDate)} for ${formatReasonLabel(reason)}. Note: ${internalNote || "None"}`,
    performedBy,
  });

  return createdBlocks;
}

/**
 * Logs an operational action to the AuditLog table
 */
export async function logAuditAction({
  shop,
  action,
  entityType,
  entityId,
  details,
  performedBy = "Admin",
}) {
  try {
    await ensureAvailabilityTablesExist();
    try {
      await prisma.auditLog.create({
        data: {
          shop,
          action,
          entityType,
          entityId: String(entityId),
          details,
          performedBy,
        },
      });
    } catch (e) {
      const auditId = "aud_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      await prisma.$executeRawUnsafe(
        `INSERT INTO "AuditLog" ("id", "shop", "action", "entityType", "entityId", "details", "performedBy", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        auditId,
        shop,
        action,
        entityType,
        String(entityId),
        details || "",
        performedBy
      );
    }
  } catch (e) {
    console.warn("Could not write audit log:", e?.message);
  }
}
