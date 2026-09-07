import { useState } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation, useRouteError, Form, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";
import {
  checkProductAvailability,
  createAvailabilityBlock,
  unblockAvailabilityBlock,
  bulkCreateAvailabilityBlocks,
  getAvailableProductsForDates,
  ensureAvailabilityTablesExist,
  logAuditAction,
} from "../utils/availability.server.js";
import {
  formatDisplayDate,
  formatReasonLabel,
  getReasonColor,
} from "../utils/availability.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureAvailabilityTablesExist();
  const url = new URL(request.url);

  const search = url.searchParams.get("search") || "";
  const selectedProductIdParam = url.searchParams.get("productId") || "";
  const activeTab = url.searchParams.get("tab") || "inspector"; // inspector, bulk, storewide, search_dates
  const checkPickup = url.searchParams.get("checkPickup") || "";
  const checkReturn = url.searchParams.get("checkReturn") || "";

  const searchFrom = url.searchParams.get("searchFrom") || "";
  const searchTo = url.searchParams.get("searchTo") || "";
  const searchCategory = url.searchParams.get("searchCategory") || "ALL";

  // 1. Fetch Shopify Products matching search or initial batch
  let products = [];
  try {
    const gqlQuery = search.trim() !== ""
      ? `query searchProducts($q: String!) {
          products(first: 50, query: $q) {
            nodes {
              id
              title
              handle
              productType
              featuredImage { url altText }
              variants(first: 5) {
                nodes { id title price }
              }
            }
          }
        }`
      : `query getInitialProducts {
          products(first: 50) {
            nodes {
              id
              title
              handle
              productType
              featuredImage { url altText }
              variants(first: 5) {
                nodes { id title price }
              }
            }
          }
        }`;

    const variables = search.trim() !== "" ? { q: search.trim() } : {};
    const res = await admin.graphql(gqlQuery, { variables });
    const json = await res.json();
    products = json.data?.products?.nodes || [];
  } catch (err) {
    console.error("Error querying Shopify products in availability loader:", err);
  }

  // 2. Select active product
  let selectedProduct = null;
  if (selectedProductIdParam) {
    selectedProduct = products.find((p) => p.id === selectedProductIdParam);
    if (!selectedProduct) {
      // If not in current search list, fetch specific product by ID
      try {
        const singleRes = await admin.graphql(
          `query getSingleProduct($id: ID!) {
            product(id: $id) {
              id
              title
              handle
              productType
              featuredImage { url altText }
              variants(first: 5) {
                nodes { id title price }
              }
            }
          }`,
          { variables: { id: selectedProductIdParam } }
        );
        const singleJson = await singleRes.json();
        if (singleJson.data?.product) {
          selectedProduct = singleJson.data.product;
          products.unshift(selectedProduct);
        }
      } catch (e) {}
    }
  }

  // Default to first product if none explicitly selected
  if (!selectedProduct && products.length > 0) {
    selectedProduct = products[0];
  }

  // 3. Inspect Selected Product Data (Config, Rentals, Blocks, Today Status)
  let productConfig = null;
  let activeRentals = [];
  let activeBlocks = [];
  let todayStatus = { state: "AVAILABLE", label: "🟢 Available Today", color: "#16a34a" };
  let nextBookingDate = null;
  let nextBlockDate = null;
  let checkResult = null;

  if (selectedProduct) {
    const cleanId = selectedProduct.id.replace("gid://shopify/Product/", "");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch config
    try {
      productConfig = await prisma.rentalProductConfig.findFirst({
        where: {
          shop: session.shop,
          productId: { contains: cleanId },
        },
      });
    } catch (e) {}

    // Fetch active/upcoming rentals
    try {
      activeRentals = await prisma.rental.findMany({
        where: {
          shop: session.shop,
          productId: { contains: cleanId },
          status: { notIn: ["CANCELLED"] },
          returnDate: { gte: today },
        },
        orderBy: { pickupDate: "asc" },
      });
    } catch (e) {}

    // Fetch active blocks
    try {
      activeBlocks = await prisma.availabilityBlock.findMany({
        where: {
          shop: session.shop,
          productId: { contains: cleanId },
          status: "ACTIVE",
          endDate: { gte: today },
        },
        orderBy: { startDate: "asc" },
      });
    } catch (e) {
      try {
        activeBlocks = await prisma.$queryRawUnsafe(
          `SELECT * FROM "AvailabilityBlock"
           WHERE "shop" = $1 AND "productId" LIKE $2 AND "status" = 'ACTIVE' AND "endDate" >= $3
           ORDER BY "startDate" ASC`,
          session.shop,
          `%${cleanId}%`,
          today
        );
      } catch (rawErr) {
        activeBlocks = [];
      }
    }

    // Determine Today's Operational Status
    if (productConfig?.isEnabled === false) {
      todayStatus = { state: "DISABLED", label: "⛔ Out of Service / Disabled", color: "#dc2626" };
    } else if (productConfig?.isDamaged) {
      todayStatus = { state: "DAMAGED", label: "🔴 Damaged / Under Repair", color: "#b91c1c" };
    } else if (productConfig?.isLost) {
      todayStatus = { state: "LOST", label: "❌ Lost Inventory", color: "#991b1b" };
    } else {
      // Check if blocked today
      const todayBlock = (activeBlocks || []).find((b) => {
        const s = new Date(b.startDate);
        const e = new Date(b.endDate);
        return s <= today && e >= today;
      });

      const todayRental = (activeRentals || []).find((r) => {
        const p = new Date(r.pickupDate);
        const ret = new Date(r.returnDate);
        return p <= today && ret >= today;
      });

      if (todayBlock) {
        todayStatus = {
          state: todayBlock.reason,
          label: `${formatReasonLabel(todayBlock.reason)} Today`,
          color: getReasonColor(todayBlock.reason),
        };
      } else if (todayRental) {
        todayStatus = {
          state: todayRental.status === "OFFLINE_BOOKED" ? "OFFLINE_BOOKING" : "RENTAL",
          label: todayRental.status === "OFFLINE_BOOKED" ? "🟠 In-Store Booking Today" : "🔴 Customer Booking Today",
          color: todayRental.status === "OFFLINE_BOOKED" ? "#f97316" : "#ef4444",
        };
      }
    }

    // Next upcoming booking & block dates
    if (activeRentals && activeRentals.length > 0) {
      nextBookingDate = formatDisplayDate(activeRentals[0].pickupDate);
    }
    if (activeBlocks && activeBlocks.length > 0) {
      nextBlockDate = formatDisplayDate(activeBlocks[0].startDate);
    }

    // Quick Date Availability Check
    if (checkPickup && checkReturn) {
      checkResult = await checkProductAvailability({
        shop: session.shop,
        productId: selectedProduct.id,
        pickupDate: checkPickup,
        returnDate: checkReturn,
        isStorefront: false, // ADMIN: FULL OPERATIONAL DETAILS
      });
    }
  }

  // 4. Store-Wide Blocked Inventory (Tab 3)
  let storeWideBlocks = [];
  try {
    storeWideBlocks = await prisma.availabilityBlock.findMany({
      where: {
        shop: session.shop,
        status: "ACTIVE",
      },
      orderBy: { startDate: "asc" },
      take: 100,
    });
  } catch (e) {
    try {
      storeWideBlocks = await prisma.$queryRawUnsafe(
        `SELECT * FROM "AvailabilityBlock" WHERE "shop" = $1 AND "status" = 'ACTIVE' ORDER BY "startDate" ASC LIMIT 100`,
        session.shop
      );
    } catch (rawErr) {
      storeWideBlocks = [];
    }
  }

  // 5. Availability Search by Date & Category (Tab 4)
  let searchDatesResult = null;
  if (searchFrom && searchTo) {
    const rawResult = await getAvailableProductsForDates(session.shop, searchFrom, searchTo);
    const unavailableSet = new Set(rawResult.unavailableProductIds.map((id) => String(id).replace("gid://shopify/Product/", "")));
    const bookedSet = new Set(rawResult.bookedProductIds.map((id) => String(id).replace("gid://shopify/Product/", "")));
    const blockedSet = new Set(rawResult.blockedProductIds.map((id) => String(id).replace("gid://shopify/Product/", "")));

    let filtered = products;
    if (searchCategory !== "ALL") {
      filtered = products.filter((p) => (p.productType || "").toLowerCase() === searchCategory.toLowerCase());
    }

    const availableItems = [];
    const bookedItems = [];
    const blockedItems = [];

    for (const p of filtered) {
      const cleanId = p.id.replace("gid://shopify/Product/", "");
      if (bookedSet.has(cleanId)) {
        bookedItems.push(p);
      } else if (blockedSet.has(cleanId)) {
        blockedItems.push(p);
      } else if (unavailableSet.has(cleanId)) {
        blockedItems.push(p);
      } else {
        availableItems.push(p);
      }
    }

    searchDatesResult = {
      availableItems,
      bookedItems,
      blockedItems,
      total: filtered.length,
    };
  }

  return {
    products,
    selectedProduct,
    productConfig,
    activeRentals: activeRentals || [],
    activeBlocks: activeBlocks || [],
    todayStatus,
    nextBookingDate,
    nextBlockDate,
    checkResult,
    storeWideBlocks: storeWideBlocks || [],
    searchDatesResult,
    activeTab,
    search,
    checkPickup,
    checkReturn,
    searchFrom,
    searchTo,
    searchCategory,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  await ensureAvailabilityTablesExist();

  try {
    const formData = await request.formData();
    const actionType = formData.get("_action");

    // ACTION 1: MANUAL DATE BLOCKING WITH OVERLAP CONFLICT DETECTION
    if (actionType === "block_dates") {
      const productId = formData.get("productId");
      const productTitle = formData.get("productTitle");
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate") || startDate; // Support single-day blocking
      const reason = formData.get("reason") || "OTHER";
      const customerName = formData.get("customerName")?.trim() || null;
      const customerPhone = formData.get("customerPhone")?.trim() || null;
      const internalNote = formData.get("internalNote")?.trim() || null;
      const forceOverride = formData.get("forceOverride") === "true";

      if (!productId || !startDate) {
        return { error: "Please select a product and start date." };
      }

      // Conflict Check (unless admin explicitly confirmed force-override)
      if (!forceOverride) {
        const availability = await checkProductAvailability({
          shop: session.shop,
          productId,
          pickupDate: startDate,
          returnDate: endDate,
          isStorefront: false,
        });

        if (!availability.isAvailable) {
          return {
            conflictWarning: true,
            message: availability.message,
            conflicts: availability.conflicts,
            pendingBlock: {
              productId,
              productTitle,
              startDate,
              endDate,
              reason,
              customerName,
              customerPhone,
              internalNote,
            },
          };
        }
      }

      try {
        await createAvailabilityBlock({
          shop: session.shop,
          productId,
          productTitle,
          startDate,
          endDate,
          reason,
          customerName,
          customerPhone,
          internalNote,
          createdBy: "Admin",
        });

        return { success: `Successfully blocked dates for "${productTitle}" (${formatReasonLabel(reason)})!` };
      } catch (err) {
        return { error: err.message || "Failed to create availability block." };
      }
    }

    // ACTION 2: ONE-CLICK UNBLOCK DATES
    if (actionType === "unblock_dates") {
      const blockId = formData.get("blockId");
      if (!blockId) return { error: "Invalid block ID." };

      try {
        await unblockAvailabilityBlock(session.shop, blockId, "Admin");
        return { success: "Dates unblocked successfully! Outfit is now available for those dates." };
      } catch (err) {
        return { error: err.message || "Failed to unblock dates." };
      }
    }

    // ACTION 3: BULK DATE BLOCKING ACROSS MULTIPLE OUTFITS
    if (actionType === "bulk_block") {
      const productIdsRaw = formData.get("productIds");
      const startDate = formData.get("startDate");
      const endDate = formData.get("endDate") || startDate;
      const reason = formData.get("reason") || "MAINTENANCE";
      const internalNote = formData.get("internalNote")?.trim() || null;

      if (!productIdsRaw || !startDate) {
        return { error: "Please select at least one product and dates." };
      }

      const productIds = productIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      if (productIds.length === 0) {
        return { error: "No products selected for bulk blocking." };
      }

      try {
        await bulkCreateAvailabilityBlocks({
          shop: session.shop,
          productIds,
          startDate,
          endDate,
          reason,
          internalNote,
          createdBy: "Admin",
        });

        return { success: `Successfully bulk-blocked ${productIds.length} outfits (${formatReasonLabel(reason)})!` };
      } catch (err) {
        return { error: err.message || "Failed to bulk block outfits." };
      }
    }

    // ACTION 4: TOGGLE PRODUCT STATUS (Enabled / Damaged / Lost)
    if (actionType === "toggle_product_status") {
      const productId = formData.get("productId");
      const isEnabled = formData.get("isEnabled") === "true";
      const isDamaged = formData.get("isDamaged") === "true";
      const isLost = formData.get("isLost") === "true";

      const cleanId = String(productId).replace("gid://shopify/Product/", "");

      await prisma.rentalProductConfig.upsert({
        where: {
          shop_productId_variantId: {
            shop: session.shop,
            productId: cleanId,
            variantId: "",
          },
        },
        update: {
          isEnabled,
          isDamaged,
          isLost,
        },
        create: {
          shop: session.shop,
          productId: cleanId,
          variantId: "",
          rentalPrice: 0,
          securityDeposit: 0,
          isEnabled,
          isDamaged,
          isLost,
        },
      });

      await logAuditAction({
        shop: session.shop,
        action: "PRODUCT_STATUS_UPDATED",
        entityType: "PRODUCT",
        entityId: cleanId,
        details: `Updated status: isEnabled=${isEnabled}, isDamaged=${isDamaged}, isLost=${isLost}`,
        performedBy: "Admin",
      });

      return { success: "Product rental status updated successfully!" };
    }

    return null;
  } catch (actionErr) {
    if (actionErr instanceof Response) throw actionErr;
    console.error("Critical error in availability action:", actionErr);
    return { error: actionErr?.message || "An unexpected error occurred while processing your request." };
  }
};

export default function AvailabilityManager() {
  const {
    products = [],
    selectedProduct = null,
    productConfig = null,
    activeRentals = [],
    activeBlocks = [],
    todayStatus = { state: "AVAILABLE", label: "🟢 Available Today", color: "#16a34a" },
    nextBookingDate = null,
    nextBlockDate = null,
    checkResult = null,
    storeWideBlocks = [],
    searchDatesResult = null,
    activeTab = "inspector",
    search = "",
    checkPickup = "",
    checkReturn = "",
    searchFrom = "",
    searchTo = "",
    searchCategory = "ALL",
    loadError = null,
  } = useLoaderData() || {};

  const actionData = useActionData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [currentTab, setCurrentTab] = useState(activeTab);
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  // Handle tab switching
  const handleTabChange = (tabName) => {
    setCurrentTab(tabName);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tabName);
    window.history.replaceState({}, "", url.toString());
  };

  // Bulk checkbox toggle
  const toggleSelectProduct = (id) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const selectAllProducts = () => {
    if (selectedProductIds.length === products.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(products.map((p) => p.id));
    }
  };

  return (
    <s-page heading="Smart Inventory Availability & Date Blocker">
      <style>{`
        .apple-wrap {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #2E3346;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .apple-card {
          background-color: #FFFFFF;
          border-radius: 16px;
          border: 1px solid #E2E4EB;
          box-shadow: 0 4px 20px -2px rgba(46, 51, 70, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02);
          overflow: hidden;
          transition: box-shadow 0.2s ease, transform 0.2s ease;
        }
        .apple-card-body {
          padding: 24px;
        }
        .apple-segmented-bar {
          display: inline-flex;
          background-color: #F1F2F6;
          padding: 4px;
          border-radius: 9999px;
          gap: 4px;
          border: 1px solid #E2E4EB;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
          flex-wrap: wrap;
        }
        .apple-tab-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 20px;
          border-radius: 9999px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          border: none;
          outline: none;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          text-decoration: none;
        }
        .apple-tab-pill.active {
          background-color: #7964FF;
          color: #FFFFFF;
          box-shadow: 0 3px 12px rgba(121, 100, 255, 0.35);
        }
        .apple-tab-pill.inactive {
          background-color: transparent;
          color: #646B7C;
        }
        .apple-tab-pill.inactive:hover {
          background-color: rgba(121, 100, 255, 0.08);
          color: #2E3346;
        }
        .apple-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #D8DCE6;
          background-color: #FAFAFC;
          font-size: 13.5px;
          color: #2E3346;
          box-sizing: border-box;
          transition: all 0.2s ease;
          font-family: inherit;
        }
        .apple-input:focus {
          outline: none;
          border-color: #7964FF;
          background-color: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(121, 100, 255, 0.16);
        }
        .apple-select {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #D8DCE6;
          background-color: #FAFAFC;
          font-size: 13.5px;
          color: #2E3346;
          box-sizing: border-box;
          transition: all 0.2s ease;
          font-family: inherit;
          cursor: pointer;
        }
        .apple-select:focus {
          outline: none;
          border-color: #7964FF;
          background-color: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(121, 100, 255, 0.16);
        }
        .apple-btn-primary {
          background-color: #7964FF;
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          padding: 10px 20px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(121, 100, 255, 0.26);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
        }
        .apple-btn-primary:hover:not(:disabled) {
          background-color: #6852FF;
          box-shadow: 0 4px 14px rgba(121, 100, 255, 0.36);
          transform: translateY(-1px);
        }
        .apple-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .apple-btn-secondary {
          background-color: #F0EEFF;
          color: #7964FF;
          border: 1px solid #D8D2FF;
          border-radius: 10px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-decoration: none;
        }
        .apple-btn-secondary:hover {
          background-color: #E6E1FF;
        }
        .apple-btn-danger {
          background-color: #FEF2F2;
          color: #DC2626;
          border: 1px solid #FECACA;
          border-radius: 8px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .apple-btn-danger:hover {
          background-color: #FEE2E2;
          border-color: #FCA5A5;
        }
        .apple-label {
          display: block;
          font-size: 11.5px;
          font-weight: 600;
          color: #646B7C;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .apple-stat-card {
          background-color: #F8F9FC;
          border: 1px solid #EAECEF;
          border-radius: 12px;
          padding: 16px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .apple-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(46, 51, 70, 0.04);
        }
        .apple-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13.5px;
        }
        .apple-table th {
          background-color: #F8F9FC;
          color: #646B7C;
          font-weight: 600;
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 14px 18px;
          border-bottom: 1px solid #E2E4EB;
          text-align: left;
        }
        .apple-table td {
          padding: 14px 18px;
          border-bottom: 1px solid #F0F2F6;
          color: #2E3346;
          vertical-align: middle;
        }
        .apple-table tr:last-child td {
          border-bottom: none;
        }
        .apple-table tr:hover td {
          background-color: #FAFBFD;
        }
        .apple-pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
      `}</style>

      <div className="apple-wrap">

        {/* Notifications & Banners */}
        {actionData?.success && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#ECFDF5",
            color: "#065F46",
            borderRadius: "14px",
            border: "1px solid #A7F3D0",
            fontWeight: "600",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 2px 10px rgba(16, 185, 129, 0.08)",
          }}>
            <span style={{ fontSize: "18px" }}>✅</span>
            <span>{actionData.success}</span>
          </div>
        )}

        {actionData?.error && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#FEF2F2",
            color: "#991B1B",
            borderRadius: "14px",
            border: "1px solid #FECACA",
            fontWeight: "600",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 2px 10px rgba(220, 38, 38, 0.08)",
          }}>
            <span style={{ fontSize: "18px" }}>⚠️</span>
            <span>{actionData.error}</span>
          </div>
        )}

        {loadError && (
          <div style={{
            padding: "14px 18px",
            backgroundColor: "#FFFBEB",
            color: "#92400E",
            borderRadius: "14px",
            border: "1px solid #FDE68A",
            fontWeight: "600",
            fontSize: "13.5px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}>
            <span>⚠️</span>
            <span>Note: {loadError}</span>
          </div>
        )}

        {/* Overlapping Conflict Warning Modal */}
        {actionData?.conflictWarning && (
          <div style={{
            padding: "22px 24px",
            backgroundColor: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: "16px",
            color: "#9A3412",
            boxShadow: "0 6px 24px rgba(249, 115, 22, 0.12)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontSize: "20px" }}>⚠️</span>
              <h4 style={{ margin: 0, fontSize: "16.5px", fontWeight: "700", color: "#9A3412" }}>
                Availability Conflict Detected!
              </h4>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#9A3412", lineHeight: "1.5" }}>
              {actionData.message}
            </p>
            <div style={{
              marginBottom: "16px",
              backgroundColor: "#FFFFFF",
              padding: "14px 18px",
              borderRadius: "12px",
              border: "1px solid #FFEDD5",
              fontSize: "13px",
            }}>
              <strong style={{ color: "#7C2D12", display: "block", marginBottom: "8px" }}>Conflicting Operational Entries:</strong>
              <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {actionData.conflicts?.map((c, i) => (
                  <li key={i} style={{ color: "#431407" }}>
                    <strong>{formatReasonLabel(c.reason || c.type)}:</strong> {formatDisplayDate(c.startDate)} to {formatDisplayDate(c.endDate)} ({c.customerName || c.bookingId || "System Block"})
                  </li>
                ))}
              </ul>
            </div>
            <p style={{ fontSize: "13px", margin: "0 0 16px", color: "#9A3412" }}>
              Do you still want to force-block these dates? (Accidental overlapping blocks are discouraged).
            </p>
            <Form method="post" style={{ display: "inline-flex", gap: "10px", flexWrap: "wrap" }}>
              <input type="hidden" name="_action" value="block_dates" />
              <input type="hidden" name="forceOverride" value="true" />
              <input type="hidden" name="productId" value={actionData.pendingBlock?.productId} />
              <input type="hidden" name="productTitle" value={actionData.pendingBlock?.productTitle} />
              <input type="hidden" name="startDate" value={actionData.pendingBlock?.startDate} />
              <input type="hidden" name="endDate" value={actionData.pendingBlock?.endDate} />
              <input type="hidden" name="reason" value={actionData.pendingBlock?.reason} />
              <input type="hidden" name="customerName" value={actionData.pendingBlock?.customerName || ""} />
              <input type="hidden" name="customerPhone" value={actionData.pendingBlock?.customerPhone || ""} />
              <input type="hidden" name="internalNote" value={actionData.pendingBlock?.internalNote || ""} />

              <button
                type="submit"
                className="apple-btn-danger"
                style={{ padding: "10px 18px", fontSize: "13.5px" }}
                disabled={isSubmitting}
              >
                {isSubmitting ? "⏳ Overriding Dates..." : "Force Block Overlapping Dates"}
              </button>
              <Link
                to={`/app/availability?productId=${encodeURIComponent(actionData.pendingBlock?.productId || "")}`}
                className="apple-btn-secondary"
              >
                Cancel
              </Link>
            </Form>
          </div>
        )}

        {/* Apple Segmented Pill Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div className="apple-segmented-bar">
            <button
              type="button"
              onClick={() => handleTabChange("inspector")}
              className={`apple-tab-pill ${currentTab === "inspector" ? "active" : "inactive"}`}
            >
              <span>🔍</span>
              <span>Product Inspector & Blocker</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("bulk")}
              className={`apple-tab-pill ${currentTab === "bulk" ? "active" : "inactive"}`}
            >
              <span>📦</span>
              <span>Bulk Date Blocking</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("storewide")}
              className={`apple-tab-pill ${currentTab === "storewide" ? "active" : "inactive"}`}
            >
              <span>📋</span>
              <span>Store-Wide Blocked ({storeWideBlocks.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("search_dates")}
              className={`apple-tab-pill ${currentTab === "search_dates" ? "active" : "inactive"}`}
            >
              <span>🔎</span>
              <span>Search Availability by Date</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            TAB 1: PRODUCT AVAILABILITY INSPECTOR & DATE BLOCKER
            ========================================================================= */}
        {currentTab === "inspector" && (
          <>
            {/* Search Bar & Dropdown Header Card */}
            <div className="apple-card">
              <div style={{ padding: "18px 24px" }}>
                <Form method="get" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="tab" value="inspector" />
                  <div style={{ flex: 1, minWidth: "260px" }}>
                    <input
                      type="text"
                      name="search"
                      defaultValue={search}
                      placeholder="Search outfit by Title, SKU, or Keyword..."
                      className="apple-input"
                    />
                  </div>
                  <button type="submit" className="apple-btn-primary">
                    Search
                  </button>

                  {products.length > 0 && (
                    <div style={{ minWidth: "280px" }}>
                      <select
                        value={selectedProduct?.id || ""}
                        onChange={(e) => {
                          const url = new URL(window.location.href);
                          url.searchParams.set("productId", e.target.value);
                          url.searchParams.set("tab", "inspector");
                          window.location.href = url.toString();
                        }}
                        className="apple-select"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </Form>
              </div>
            </div>

            {/* Product Spotlight Card & KPI Metric Counters */}
            {selectedProduct ? (
              <>
                <div className="apple-card">
                  <div className="apple-card-body">
                    <div style={{ display: "flex", gap: "22px", flexWrap: "wrap", alignItems: "center" }}>
                      {selectedProduct.featuredImage?.url ? (
                        <img
                          src={selectedProduct.featuredImage.url}
                          alt={selectedProduct.title}
                          style={{
                            width: "96px",
                            height: "96px",
                            objectFit: "cover",
                            borderRadius: "14px",
                            border: "1px solid #E2E4EB",
                            boxShadow: "0 2px 8px rgba(46, 51, 70, 0.06)",
                          }}
                        />
                      ) : (
                        <div style={{
                          width: "96px",
                          height: "96px",
                          backgroundColor: "#F0EEFF",
                          borderRadius: "14px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "40px",
                          border: "1px solid #D8D2FF",
                        }}>
                          👗
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#2E3346", letterSpacing: "-0.01em" }}>
                            {selectedProduct.title}
                          </h3>
                          <span
                            className="apple-pill-badge"
                            style={{
                              backgroundColor: todayStatus.color + "14",
                              color: todayStatus.color,
                              border: `1px solid ${todayStatus.color}35`,
                            }}
                          >
                            {todayStatus.label}
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", fontSize: "12.5px" }}>
                          <span style={{
                            backgroundColor: "#F8F9FC",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            border: "1px solid #E2E4EB",
                            color: "#646B7C",
                          }}>
                            Shopify Price: <strong style={{ color: "#2E3346" }}>₹{selectedProduct.variants?.nodes[0]?.price || "N/A"}</strong>
                          </span>
                          <span style={{
                            backgroundColor: "#F0EEFF",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            border: "1px solid #D8D2FF",
                            color: "#7964FF",
                            fontWeight: "600",
                          }}>
                            Configured Rent: ₹{productConfig?.rentalPrice || "—"}
                          </span>
                          <span style={{
                            backgroundColor: "#F8F9FC",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            border: "1px solid #E2E4EB",
                            color: "#646B7C",
                          }}>
                            Deposit: <strong style={{ color: "#2E3346" }}>₹{productConfig?.securityDeposit || "—"}</strong>
                          </span>
                          <span style={{
                            backgroundColor: "#F8F9FC",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            border: "1px solid #E2E4EB",
                            color: "#646B7C",
                          }}>
                            Category: <strong style={{ color: "#2E3346" }}>{selectedProduct.productType || "Outfit"}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Operational Status Toggle */}
                      <div>
                        <Form method="post">
                          <input type="hidden" name="_action" value="toggle_product_status" />
                          <input type="hidden" name="productId" value={selectedProduct.id} />
                          <input
                            type="hidden"
                            name="isEnabled"
                            value={productConfig?.isEnabled === false ? "true" : "false"}
                          />
                          <button
                            type="submit"
                            style={{
                              padding: "9px 16px",
                              borderRadius: "10px",
                              border: productConfig?.isEnabled === false ? "1px solid #A7F3D0" : "1px solid #FECACA",
                              backgroundColor: productConfig?.isEnabled === false ? "#ECFDF5" : "#FEF2F2",
                              color: productConfig?.isEnabled === false ? "#059669" : "#DC2626",
                              fontSize: "12.5px",
                              fontWeight: "700",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                            }}
                          >
                            {productConfig?.isEnabled === false ? "✅ Mark Available for Rent" : "⛔ Mark Out of Service"}
                          </button>
                        </Form>
                      </div>
                    </div>

                    {/* 4 Cupertino KPI Metric Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginTop: "24px", borderTop: "1px solid #F0F2F6", paddingTop: "20px" }}>
                      <div className="apple-stat-card">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#EF4444" }} />
                          <span className="apple-label" style={{ margin: 0 }}>Next Booking</span>
                        </div>
                        <h4 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: "700", color: "#EF4444" }}>
                          {nextBookingDate || "No upcoming"}
                        </h4>
                      </div>

                      <div className="apple-stat-card">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#3B82F6" }} />
                          <span className="apple-label" style={{ margin: 0 }}>Next Scheduled Block</span>
                        </div>
                        <h4 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: "700", color: "#3B82F6" }}>
                          {nextBlockDate || "No upcoming"}
                        </h4>
                      </div>

                      <div className="apple-stat-card">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#7964FF" }} />
                          <span className="apple-label" style={{ margin: 0 }}>Upcoming Bookings</span>
                        </div>
                        <h4 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: "700", color: "#7964FF" }}>
                          {activeRentals.length} Bookings
                        </h4>
                      </div>

                      <div className="apple-stat-card">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#646B7C" }} />
                          <span className="apple-label" style={{ margin: 0 }}>Active Operational Blocks</span>
                        </div>
                        <h4 style={{ margin: "4px 0 0", fontSize: "16px", fontWeight: "700", color: "#2E3346" }}>
                          {activeBlocks.length} Active
                        </h4>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2-Column Split: Instant Date Checker & Manual Date Blocker Form */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>

                  {/* Column 1: Instant Date Availability Checker */}
                  <div className="apple-card">
                    <div className="apple-card-body">
                      <div style={{ marginBottom: "16px" }}>
                        <h4 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "700", color: "#2E3346" }}>
                          🔎 Instant Date Availability Checker
                        </h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "#646B7C" }}>
                          Verify if this outfit is available before taking custom customer inquiries or phone bookings.
                        </p>
                      </div>

                      <Form method="get">
                        <input type="hidden" name="tab" value="inspector" />
                        <input type="hidden" name="productId" value={selectedProduct.id} />
                        <input type="hidden" name="search" value={search} />

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                          <div>
                            <label className="apple-label">Pickup Date</label>
                            <input
                              type="date"
                              name="checkPickup"
                              defaultValue={checkPickup}
                              required
                              className="apple-input"
                            />
                          </div>
                          <div>
                            <label className="apple-label">Return Date</label>
                            <input
                              type="date"
                              name="checkReturn"
                              defaultValue={checkReturn}
                              required
                              className="apple-input"
                            />
                          </div>
                        </div>

                        <button type="submit" className="apple-btn-primary" style={{ width: "100%" }}>
                          Check Availability
                        </button>
                      </Form>

                      {/* Checker Result Display */}
                      {checkResult && (
                        <div
                          style={{
                            marginTop: "18px",
                            padding: "16px 18px",
                            borderRadius: "12px",
                            backgroundColor: checkResult.isAvailable ? "#ECFDF5" : "#FEF2F2",
                            border: `1px solid ${checkResult.isAvailable ? "#A7F3D0" : "#FECACA"}`,
                          }}
                        >
                          <strong style={{ display: "block", fontSize: "14px", color: checkResult.isAvailable ? "#065F46" : "#991B1B" }}>
                            {checkResult.isAvailable ? "🎉 Outfit is Available!" : "⚠️ Unavailable for these dates"}
                          </strong>
                          <p style={{ margin: "6px 0 0", fontSize: "13px", color: checkResult.isAvailable ? "#047857" : "#B91C1C" }}>
                            {checkResult.message}
                          </p>

                          {/* Admin detailed conflicts breakdown */}
                          {!checkResult.isAvailable && checkResult.conflicts?.length > 0 && (
                            <div style={{ marginTop: "12px", fontSize: "12.5px", borderTop: "1px dashed #FECACA", paddingTop: "10px" }}>
                              <strong style={{ color: "#991B1B" }}>Conflicting Operational Entries:</strong>
                              <ul style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                {checkResult.conflicts.map((c, i) => (
                                  <li key={i} style={{ color: "#7F1D1D" }}>
                                    <strong>{formatReasonLabel(c.reason || c.type)}:</strong> {formatDisplayDate(c.startDate)} to {formatDisplayDate(c.endDate)}
                                    {c.customerName ? ` (${c.customerName})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Manual Date Blocker Form */}
                  <div className="apple-card">
                    <div className="apple-card-body">
                      <div style={{ marginBottom: "16px" }}>
                        <h4 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "700", color: "#2E3346" }}>
                          🔒 Block Dates for this Outfit
                        </h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "#646B7C" }}>
                          Block single date or date ranges for In-Store Bookings, Dry Cleaning, Fitting, or Maintenance.
                        </p>
                      </div>

                      <Form method="post">
                        <input type="hidden" name="_action" value="block_dates" />
                        <input type="hidden" name="productId" value={selectedProduct.id} />
                        <input type="hidden" name="productTitle" value={selectedProduct.title} />

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                          <div>
                            <label className="apple-label">Start Date *</label>
                            <input
                              type="date"
                              name="startDate"
                              required
                              className="apple-input"
                            />
                          </div>
                          <div>
                            <label className="apple-label">End Date *</label>
                            <input
                              type="date"
                              name="endDate"
                              required
                              className="apple-input"
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: "12px" }}>
                          <label className="apple-label">Block Reason *</label>
                          <select
                            name="reason"
                            required
                            className="apple-select"
                          >
                            <option value="OFFLINE_BOOKING">🏬 Offline / In-Store Customer Booking</option>
                            <option value="CLEANING">🧼 Cleaning & Washing</option>
                            <option value="ALTERATION">✂️ Alteration, Fitting & Tailoring</option>
                            <option value="MAINTENANCE">⚫ Maintenance, Steaming & Repair</option>
                            <option value="CUSTOMER_HOLD">🟡 Customer Hold (Trial / Measurement)</option>
                            <option value="DAMAGED">🔴 Damaged / Under Restoration</option>
                            <option value="LOST">❌ Lost Inventory</option>
                            <option value="PERSONAL_USE">👤 Personal / Studio Shoot Use</option>
                            <option value="OTHER">📝 Other / Manual Admin Block</option>
                          </select>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                          <div>
                            <label className="apple-label">Customer Name (Optional)</label>
                            <input
                              type="text"
                              name="customerName"
                              placeholder="e.g. Rahul Sharma"
                              className="apple-input"
                            />
                          </div>
                          <div>
                            <label className="apple-label">Phone (Optional)</label>
                            <input
                              type="text"
                              name="customerPhone"
                              placeholder="e.g. 9876543210"
                              className="apple-input"
                            />
                          </div>
                        </div>

                        <div style={{ marginBottom: "16px" }}>
                          <label className="apple-label">Internal Operational Note</label>
                          <input
                            type="text"
                            name="internalNote"
                            placeholder="e.g. Blouse alteration for reception; dry cleaning at City Centre"
                            className="apple-input"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="apple-btn-primary"
                          style={{ width: "100%" }}
                        >
                          {isSubmitting ? "⏳ Blocking Dates..." : "🔒 Block Dates"}
                        </button>
                      </Form>
                    </div>
                  </div>

                </div>

                {/* Unified Schedule Table: Bookings & Active Blocks for this Product */}
                <div className="apple-card">
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E4EB", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: "700", color: "#2E3346" }}>
                        Upcoming Bookings & Blocked Dates Schedule
                      </h4>
                      <p style={{ margin: 0, fontSize: "12.5px", color: "#646B7C" }}>
                        All scheduled operational blocks and confirmed rentals for this outfit.
                      </p>
                    </div>
                    <span style={{
                      backgroundColor: "#F0EEFF",
                      color: "#7964FF",
                      border: "1px solid #D8D2FF",
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}>
                      {activeRentals.length + activeBlocks.length} Scheduled
                    </span>
                  </div>

                  {activeRentals.length === 0 && activeBlocks.length === 0 ? (
                    <div style={{ padding: "40px 20px", textAlign: "center", color: "#646B7C" }}>
                      <span style={{ fontSize: "36px", display: "block", marginBottom: "10px" }}>✨</span>
                      <strong style={{ fontSize: "15px", color: "#2E3346", display: "block", marginBottom: "4px" }}>
                        No Active Bookings or Blocks
                      </strong>
                      <p style={{ margin: 0, fontSize: "13px" }}>
                        This outfit is completely available for customer orders and reservations.
                      </p>
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="apple-table">
                        <thead>
                          <tr>
                            <th>Type / Reason</th>
                            <th>Dates Range</th>
                            <th>Duration</th>
                            <th>Customer / Staff Note</th>
                            <th style={{ textAlign: "right" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Active Blocks */}
                          {activeBlocks.map((b) => {
                            const s = new Date(b.startDate);
                            const e = new Date(b.endDate);
                            const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
                            const color = getReasonColor(b.reason);

                            return (
                              <tr key={b.id}>
                                <td>
                                  <span
                                    className="apple-pill-badge"
                                    style={{
                                      backgroundColor: color + "14",
                                      color: color,
                                      border: `1px solid ${color}35`,
                                    }}
                                  >
                                    {formatReasonLabel(b.reason)}
                                  </span>
                                </td>
                                <td style={{ fontWeight: "600", color: "#2E3346" }}>
                                  {formatDisplayDate(b.startDate)} <span style={{ color: "#7964FF" }}>➔</span> {formatDisplayDate(b.endDate)}
                                </td>
                                <td>{days} Days</td>
                                <td>
                                  {b.customerName && <div><strong>Customer:</strong> {b.customerName} {b.customerPhone ? `(${b.customerPhone})` : ""}</div>}
                                  {b.internalNote && <div style={{ fontSize: "12px", color: "#646B7C", marginTop: "2px" }}>{b.internalNote}</div>}
                                  {!b.customerName && !b.internalNote && <span style={{ color: "#A0A7B5" }}>—</span>}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <Form
                                    method="post"
                                    onSubmit={(e) => {
                                      if (!confirm("Are you sure you want to unblock this date range? The outfit will immediately become available online.")) {
                                        e.preventDefault();
                                      }
                                    }}
                                  >
                                    <input type="hidden" name="_action" value="unblock_dates" />
                                    <input type="hidden" name="blockId" value={b.id} />
                                    <button
                                      type="submit"
                                      className="apple-btn-danger"
                                    >
                                      Unblock ✕
                                    </button>
                                  </Form>
                                </td>
                              </tr>
                            );
                          })}

                          {/* Active Rentals */}
                          {activeRentals.map((r) => {
                            const p = new Date(r.pickupDate);
                            const ret = new Date(r.returnDate);
                            const days = Math.max(1, Math.round((ret - p) / 86400000) + 1);

                            return (
                              <tr key={r.id}>
                                <td>
                                  <span
                                    className="apple-pill-badge"
                                    style={{
                                      backgroundColor: r.status === "OFFLINE_BOOKED" ? "#FFF7ED" : "#FEF2F2",
                                      color: r.status === "OFFLINE_BOOKED" ? "#D97706" : "#DC2626",
                                      border: `1px solid ${r.status === "OFFLINE_BOOKED" ? "#FED7AA" : "#FECACA"}`,
                                    }}
                                  >
                                    {r.status === "OFFLINE_BOOKED" ? "🏬 In-Store Booking" : "🔴 Customer Online Rental"}
                                  </span>
                                </td>
                                <td style={{ fontWeight: "600", color: "#2E3346" }}>
                                  {formatDisplayDate(r.pickupDate)} <span style={{ color: "#7964FF" }}>➔</span> {formatDisplayDate(r.returnDate)}
                                </td>
                                <td>{days} Days</td>
                                <td>
                                  <div><strong>{r.customerName}</strong> {r.customerPhone ? `(${r.customerPhone})` : ""}</div>
                                  <div style={{ fontSize: "11.5px", color: "#646B7C", marginTop: "2px" }}>Booking ID: {r.bookingId || r.id.slice(-6)}</div>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <Link
                                    to={`/app/rentals/${r.id}`}
                                    className="apple-btn-secondary"
                                  >
                                    View Rental ➔
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
              </>
            ) : (
              <div className="apple-card">
                <div style={{ padding: "40px 20px", textAlign: "center", color: "#646B7C" }}>
                  <span style={{ fontSize: "36px", display: "block", marginBottom: "10px" }}>🔍</span>
                  <p style={{ margin: 0, fontSize: "14px" }}>
                    No products found. Please search for an outfit to view and manage its availability.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* =========================================================================
            TAB 2: BULK DATE BLOCKING
            ========================================================================= */}
        {currentTab === "bulk" && (
          <div className="apple-card">
            <div className="apple-card-body">
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "700", color: "#2E3346" }}>
                  📦 Bulk Date Blocking Across Multiple Outfits
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#646B7C" }}>
                  Select multiple dresses or jewellery sets to block them simultaneously for maintenance, seasonal dry cleaning, or bulk hold.
                </p>
              </div>

              <Form method="post">
                <input type="hidden" name="_action" value="bulk_block" />
                <input type="hidden" name="productIds" value={selectedProductIds.join(",")} />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginBottom: "16px" }}>
                  <div>
                    <label className="apple-label">Start Date *</label>
                    <input
                      type="date"
                      name="startDate"
                      required
                      className="apple-input"
                    />
                  </div>
                  <div>
                    <label className="apple-label">End Date *</label>
                    <input
                      type="date"
                      name="endDate"
                      required
                      className="apple-input"
                    />
                  </div>
                  <div>
                    <label className="apple-label">Block Reason *</label>
                    <select
                      name="reason"
                      required
                      className="apple-select"
                    >
                      <option value="MAINTENANCE">⚫ Maintenance, Steaming & Repair</option>
                      <option value="CLEANING">🧼 Cleaning & Washing</option>
                      <option value="CUSTOMER_HOLD">🟡 Customer Hold</option>
                      <option value="OFFLINE_BOOKING">🏬 Offline / In-Store Booking</option>
                      <option value="OTHER">📝 Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label className="apple-label">Internal Note</label>
                  <input
                    type="text"
                    name="internalNote"
                    placeholder="e.g. Scheduled deep dry-cleaning post wedding rush"
                    className="apple-input"
                  />
                </div>

                {/* Product Selection List */}
                <div style={{ border: "1px solid #E2E4EB", borderRadius: "12px", overflow: "hidden", marginBottom: "20px", backgroundColor: "#FAFAFC" }}>
                  <div style={{
                    padding: "12px 18px",
                    backgroundColor: "#F8F9FC",
                    borderBottom: "1px solid #E2E4EB",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}>
                    <strong style={{ fontSize: "13.5px", color: "#2E3346" }}>
                      Select Outfits ({selectedProductIds.length} Selected)
                    </strong>
                    <button
                      type="button"
                      onClick={selectAllProducts}
                      style={{
                        background: "transparent",
                        border: "0",
                        color: "#7964FF",
                        fontWeight: "600",
                        cursor: "pointer",
                        fontSize: "12.5px",
                      }}
                    >
                      {selectedProductIds.length === products.length ? "Deselect All" : "Select All Products"}
                    </button>
                  </div>

                  <div style={{ maxHeight: "340px", overflowY: "auto", padding: "8px 18px", backgroundColor: "#FFFFFF" }}>
                    {products.map((p) => (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "10px 0",
                          borderBottom: "1px solid #F0F2F6",
                          cursor: "pointer",
                          fontSize: "13.5px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(p.id)}
                          onChange={() => toggleSelectProduct(p.id)}
                          style={{
                            width: "16px",
                            height: "16px",
                            accentColor: "#7964FF",
                            cursor: "pointer",
                          }}
                        />
                        <span style={{ fontWeight: selectedProductIds.includes(p.id) ? "600" : "400", color: "#2E3346" }}>
                          {p.title}
                        </span>
                        <span style={{
                          fontSize: "12px",
                          color: "#7964FF",
                          marginLeft: "auto",
                          backgroundColor: "#F0EEFF",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontWeight: "600",
                        }}>
                          ₹{p.variants?.nodes[0]?.price || ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={selectedProductIds.length === 0 || isSubmitting}
                  className="apple-btn-primary"
                >
                  {isSubmitting ? "⏳ Blocking Outfits..." : `Block Selected (${selectedProductIds.length}) Outfits`}
                </button>
              </Form>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: STORE-WIDE BLOCKED INVENTORY
            ========================================================================= */}
        {currentTab === "storewide" && (
          <div className="apple-card">
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E4EB", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: "700", color: "#2E3346" }}>
                  📋 Store-Wide Blocked Inventory
                </h3>
                <p style={{ margin: 0, fontSize: "12.5px", color: "#646B7C" }}>
                  Live overview of all outfits currently blocked across the catalog (at dry cleaner, in alteration, or offline booked).
                </p>
              </div>
              <span style={{
                backgroundColor: "#F0EEFF",
                color: "#7964FF",
                border: "1px solid #D8D2FF",
                padding: "4px 12px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: "700",
              }}>
                {storeWideBlocks.length} Blocked Outfits
              </span>
            </div>

            {storeWideBlocks.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#646B7C" }}>
                <span style={{ fontSize: "36px", display: "block", marginBottom: "10px" }}>✨</span>
                <strong style={{ fontSize: "15px", color: "#2E3346", display: "block", marginBottom: "4px" }}>
                  No Active Store-Wide Blocks
                </strong>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  All outfits without bookings are currently available for customer orders.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="apple-table">
                  <thead>
                    <tr>
                      <th>Outfit / Product</th>
                      <th>Reason</th>
                      <th>Blocked Dates</th>
                      <th>Customer / Staff Note</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeWideBlocks.map((b) => {
                      const color = getReasonColor(b.reason);
                      return (
                        <tr key={b.id}>
                          <td style={{ fontWeight: "600" }}>
                            <Link
                              to={`/app/availability?productId=${encodeURIComponent(b.productId)}&tab=inspector`}
                              style={{ color: "#7964FF", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <span>{b.productTitle || b.productId}</span>
                              <span style={{ fontSize: "12px" }}>➔</span>
                            </Link>
                          </td>
                          <td>
                            <span
                              className="apple-pill-badge"
                              style={{
                                backgroundColor: color + "14",
                                color: color,
                                border: `1px solid ${color}35`,
                              }}
                            >
                              {formatReasonLabel(b.reason)}
                            </span>
                          </td>
                          <td style={{ fontWeight: "600", color: "#2E3346" }}>
                            {formatDisplayDate(b.startDate)} <span style={{ color: "#7964FF" }}>➔</span> {formatDisplayDate(b.endDate)}
                          </td>
                          <td style={{ color: "#646B7C" }}>
                            {b.customerName && <div><strong style={{ color: "#2E3346" }}>{b.customerName}</strong> {b.customerPhone ? `(${b.customerPhone})` : ""}</div>}
                            {b.internalNote && <div style={{ fontSize: "12px", marginTop: "2px" }}>{b.internalNote}</div>}
                            {!b.customerName && !b.internalNote && "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Form
                              method="post"
                              onSubmit={(e) => {
                                if (!confirm("Are you sure you want to unblock this outfit?")) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="_action" value="unblock_dates" />
                              <input type="hidden" name="blockId" value={b.id} />
                              <button
                                type="submit"
                                className="apple-btn-danger"
                              >
                                Unblock ✕
                              </button>
                            </Form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            TAB 4: AVAILABILITY SEARCH BY DATE & CATEGORY
            ========================================================================= */}
        {currentTab === "search_dates" && (
          <div className="apple-card">
            <div className="apple-card-body">
              <div style={{ marginBottom: "20px" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "700", color: "#2E3346" }}>
                  🔎 Search Available Outfits by Date & Category
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#646B7C" }}>
                  Instantly discover which outfits are free for a customer's specific event dates.
                </p>
              </div>

              <Form method="get">
                <input type="hidden" name="tab" value="search_dates" />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", alignItems: "flex-end" }}>
                  <div>
                    <label className="apple-label">Event / Pickup Date *</label>
                    <input
                      type="date"
                      name="searchFrom"
                      defaultValue={searchFrom}
                      required
                      className="apple-input"
                    />
                  </div>
                  <div>
                    <label className="apple-label">Return Date *</label>
                    <input
                      type="date"
                      name="searchTo"
                      defaultValue={searchTo}
                      required
                      className="apple-input"
                    />
                  </div>
                  <div>
                    <label className="apple-label">Category</label>
                    <select
                      name="searchCategory"
                      defaultValue={searchCategory}
                      className="apple-select"
                    >
                      <option value="ALL">All Categories</option>
                      <option value="lehenga">Lehenga</option>
                      <option value="sherwani">Sherwani</option>
                      <option value="gown">Gown</option>
                      <option value="saree">Saree</option>
                      <option value="jewellery">Jewellery</option>
                    </select>
                  </div>
                  <div>
                    <button type="submit" className="apple-btn-primary" style={{ width: "100%" }}>
                      Search Availability
                    </button>
                  </div>
                </div>
              </Form>

              {/* Results Counters & Listing */}
              {searchDatesResult && (
                <div style={{ marginTop: "28px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "24px" }}>
                    <div style={{
                      backgroundColor: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      padding: "16px 18px",
                      borderRadius: "14px",
                    }}>
                      <span style={{ fontSize: "12px", color: "#065F46", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Available to Rent
                      </span>
                      <h3 style={{ margin: "6px 0 0", fontSize: "24px", fontWeight: "700", color: "#059669" }}>
                        {searchDatesResult.availableItems.length} Outfits
                      </h3>
                    </div>

                    <div style={{
                      backgroundColor: "#FEF2F2",
                      border: "1px solid #FECACA",
                      padding: "16px 18px",
                      borderRadius: "14px",
                    }}>
                      <span style={{ fontSize: "12px", color: "#991B1B", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Customer Booked
                      </span>
                      <h3 style={{ margin: "6px 0 0", fontSize: "24px", fontWeight: "700", color: "#DC2626" }}>
                        {searchDatesResult.bookedItems.length} Outfits
                      </h3>
                    </div>

                    <div style={{
                      backgroundColor: "#FFF7ED",
                      border: "1px solid #FED7AA",
                      padding: "16px 18px",
                      borderRadius: "14px",
                    }}>
                      <span style={{ fontSize: "12px", color: "#9A3412", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Blocked (Cleaning / Maint)
                      </span>
                      <h3 style={{ margin: "6px 0 0", fontSize: "24px", fontWeight: "700", color: "#D97706" }}>
                        {searchDatesResult.blockedItems.length} Outfits
                      </h3>
                    </div>
                  </div>

                  <h4 style={{ margin: "0 0 14px", fontSize: "16px", fontWeight: "700", color: "#2E3346" }}>
                    🟢 Available Outfits ({searchDatesResult.availableItems.length})
                  </h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
                    {searchDatesResult.availableItems.map((p) => (
                      <div
                        key={p.id}
                        className="apple-card"
                        style={{
                          padding: "14px 16px",
                          backgroundColor: "#FAFBFD",
                          border: "1px solid #E2E4EB",
                        }}
                      >
                        <strong style={{ display: "block", fontSize: "14px", marginBottom: "6px", color: "#2E3346" }}>
                          {p.title}
                        </strong>
                        <span style={{
                          fontSize: "12px",
                          color: "#7964FF",
                          backgroundColor: "#F0EEFF",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          fontWeight: "600",
                        }}>
                          ₹{p.variants?.nodes[0]?.price || ""}
                        </span>
                        <div style={{ marginTop: "12px" }}>
                          <Link
                            to={`/app/availability?productId=${encodeURIComponent(p.id)}&tab=inspector`}
                            className="apple-btn-secondary"
                            style={{ fontSize: "12px", padding: "6px 12px", width: "100%", boxSizing: "border-box" }}
                          >
                            Inspect & Block ➔
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
