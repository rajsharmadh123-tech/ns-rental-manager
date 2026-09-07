import { useState } from "react";
import { useLoaderData, useActionData, useSubmit, Form, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";
import {
  checkProductAvailability,
  createAvailabilityBlock,
  unblockAvailabilityBlock,
  bulkCreateAvailabilityBlocks,
  getAvailableProductsForDates,
  logAuditAction,
} from "../utils/availability.server.js";
import {
  formatDisplayDate,
  formatReasonLabel,
  getReasonColor,
} from "../utils/availability.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
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
    } catch (e) {}

    // Determine Today's Operational Status
    if (productConfig?.isEnabled === false) {
      todayStatus = { state: "DISABLED", label: "⛔ Out of Service / Disabled", color: "#dc2626" };
    } else if (productConfig?.isDamaged) {
      todayStatus = { state: "DAMAGED", label: "🔴 Damaged / Under Repair", color: "#b91c1c" };
    } else if (productConfig?.isLost) {
      todayStatus = { state: "LOST", label: "❌ Lost Inventory", color: "#991b1b" };
    } else {
      // Check if blocked today
      const todayBlock = activeBlocks.find((b) => {
        const s = new Date(b.startDate);
        const e = new Date(b.endDate);
        return s <= today && e >= today;
      });

      const todayRental = activeRentals.find((r) => {
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
    if (activeRentals.length > 0) {
      nextBookingDate = formatDisplayDate(activeRentals[0].pickupDate);
    }
    if (activeBlocks.length > 0) {
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
  } catch (e) {}

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
    activeRentals,
    activeBlocks,
    todayStatus,
    nextBookingDate,
    nextBlockDate,
    checkResult,
    storeWideBlocks,
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
};

export default function AvailabilityManager() {
  const {
    products,
    selectedProduct,
    productConfig,
    activeRentals,
    activeBlocks,
    todayStatus,
    nextBookingDate,
    nextBlockDate,
    checkResult,
    storeWideBlocks,
    searchDatesResult,
    activeTab,
    search,
    checkPickup,
    checkReturn,
    searchFrom,
    searchTo,
    searchCategory,
  } = useLoaderData();

  const actionData = useActionData();
  const submit = useSubmit();

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

      {/* Notifications */}
      {actionData?.success && (
        <s-section>
          <div style={{ padding: "14px 18px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "10px", fontWeight: "600", fontSize: "14px" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      {actionData?.error && (
        <s-section>
          <div style={{ padding: "14px 18px", backgroundColor: "#ffe4e6", color: "#9f1239", borderRadius: "10px", fontWeight: "600", fontSize: "14px" }}>
            ⚠️ {actionData.error}
          </div>
        </s-section>
      )}

      {/* Overlapping Conflict Warning Modal */}
      {actionData?.conflictWarning && (
        <s-section>
          <div style={{ padding: "18px 20px", backgroundColor: "#fff7ed", border: "2px solid #f97316", borderRadius: "10px", color: "#9a3412" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: "700" }}>
              ⚠️ Availability Conflict Detected!
            </h4>
            <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
              {actionData.message}
            </p>
            <div style={{ marginBottom: "14px", backgroundColor: "#ffedd5", padding: "10px 14px", borderRadius: "8px", fontSize: "13px" }}>
              <strong>Conflicting Items:</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                {actionData.conflicts?.map((c, i) => (
                  <li key={i}>
                    <strong>{formatReasonLabel(c.reason || c.type)}:</strong> {formatDisplayDate(c.startDate)} to {formatDisplayDate(c.endDate)} ({c.customerName || c.bookingId || "System Block"})
                  </li>
                ))}
              </ul>
            </div>
            <p style={{ fontSize: "13px", margin: "0 0 12px" }}>
              Do you still want to force-block these dates? (Accidental overlapping blocks are discouraged).
            </p>
            <Form method="post" style={{ display: "inline-flex", gap: "10px" }}>
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

              <s-button type="submit" tone="critical">Force Block Overlapping Dates</s-button>
              <Link to={`/app/availability?productId=${encodeURIComponent(actionData.pendingBlock?.productId || "")}`} style={{ textDecoration: "none" }}>
                <s-button type="button">Cancel</s-button>
              </Link>
            </Form>
          </div>
        </s-section>
      )}

      {/* Navigation Tabs Header */}
      <s-section>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderBottom: "2px solid #E2E4EB", paddingBottom: "10px" }}>
          <button
            type="button"
            onClick={() => handleTabChange("inspector")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "0",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: currentTab === "inspector" ? "#7964FF" : "#FFFFFF",
              color: currentTab === "inspector" ? "#FFFFFF" : "#2E3346",
              boxShadow: currentTab === "inspector" ? "0 2px 8px rgba(121,100,255,0.3)" : "none",
            }}
          >
            🔍 Product Inspector & Date Blocker
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("bulk")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "0",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: currentTab === "bulk" ? "#7964FF" : "#FFFFFF",
              color: currentTab === "bulk" ? "#FFFFFF" : "#2E3346",
              boxShadow: currentTab === "bulk" ? "0 2px 8px rgba(121,100,255,0.3)" : "none",
            }}
          >
            📦 Bulk Date Blocking
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("storewide")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "0",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: currentTab === "storewide" ? "#7964FF" : "#FFFFFF",
              color: currentTab === "storewide" ? "#FFFFFF" : "#2E3346",
              boxShadow: currentTab === "storewide" ? "0 2px 8px rgba(121,100,255,0.3)" : "none",
            }}
          >
            📋 Store-Wide Blocked Inventory ({storeWideBlocks.length})
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("search_dates")}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "0",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              backgroundColor: currentTab === "search_dates" ? "#7964FF" : "#FFFFFF",
              color: currentTab === "search_dates" ? "#FFFFFF" : "#2E3346",
              boxShadow: currentTab === "search_dates" ? "0 2px 8px rgba(121,100,255,0.3)" : "none",
            }}
          >
            🔎 Availability Search (Date & Category)
          </button>
        </div>
      </s-section>

      {/* =========================================================================
          TAB 1: PRODUCT AVAILABILITY INSPECTOR & DATE BLOCKER
          ========================================================================= */}
      {currentTab === "inspector" && (
        <>
          {/* Search Bar & Dropdown */}
          <s-section>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <Form method="get" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <input type="hidden" name="tab" value="inspector" />
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    name="search"
                    defaultValue={search}
                    placeholder="Search outfit by Title, SKU, or Keyword..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #D8D2FF", fontSize: "14px", boxSizing: "border-box" }}
                  />
                </div>
                <s-button type="submit">Search</s-button>

                {products.length > 0 && (
                  <div style={{ minWidth: "260px" }}>
                    <select
                      value={selectedProduct?.id || ""}
                      onChange={(e) => {
                        const url = new URL(window.location.href);
                        url.searchParams.set("productId", e.target.value);
                        url.searchParams.set("tab", "inspector");
                        window.location.href = url.toString();
                      }}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #D8D2FF", fontSize: "14px" }}
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
            </s-box>
          </s-section>

          {/* Product Inspector Banner */}
          {selectedProduct ? (
            <>
              <s-section>
                <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#FFFFFF" }}>
                  <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center" }}>
                    {selectedProduct.featuredImage?.url ? (
                      <img
                        src={selectedProduct.featuredImage.url}
                        alt={selectedProduct.title}
                        style={{ width: "90px", height: "90px", objectFit: "cover", borderRadius: "10px", border: "1px solid #E2E4EB" }}
                      />
                    ) : (
                      <div style={{ width: "90px", height: "90px", backgroundColor: "#F0EEFF", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "36px" }}>
                        👗
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: "240px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "700" }}>{selectedProduct.title}</h3>
                        <span
                          style={{
                            backgroundColor: todayStatus.color + "18",
                            color: todayStatus.color,
                            border: `1px solid ${todayStatus.color}40`,
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "700",
                          }}
                        >
                          {todayStatus.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "16px", fontSize: "13px", color: "#646B7C" }}>
                        <span>Shopify Price: <strong>₹{selectedProduct.variants?.nodes[0]?.price || "N/A"}</strong></span>
                        <span>Configured Rent: <strong>₹{productConfig?.rentalPrice || "—"}</strong></span>
                        <span>Deposit: <strong>₹{productConfig?.securityDeposit || "—"}</strong></span>
                        <span>Category: <strong>{selectedProduct.productType || "Outfit"}</strong></span>
                      </div>
                    </div>

                    {/* Operational Toggle */}
                    <div style={{ textAlign: "right" }}>
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
                            padding: "8px 14px",
                            borderRadius: "6px",
                            border: "1px solid #ccc",
                            backgroundColor: productConfig?.isEnabled === false ? "#16a34a" : "#dc2626",
                            color: "#FFFFFF",
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          {productConfig?.isEnabled === false ? "✅ Mark Available for Rent" : "⛔ Mark Out of Service"}
                        </button>
                      </Form>
                    </div>
                  </div>

                  {/* 4 Metric Counters */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginTop: "20px", borderTop: "1px solid #E2E4EB", paddingTop: "16px" }}>
                    <div style={{ backgroundColor: "#F8F9FC", padding: "12px", borderRadius: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#646B7C" }}>Next Booking</span>
                      <h4 style={{ margin: "4px 0 0", fontSize: "16px", color: "#ef4444" }}>{nextBookingDate || "No upcoming"}</h4>
                    </div>

                    <div style={{ backgroundColor: "#F8F9FC", padding: "12px", borderRadius: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#646B7C" }}>Next Scheduled Block</span>
                      <h4 style={{ margin: "4px 0 0", fontSize: "16px", color: "#3b82f6" }}>{nextBlockDate || "No upcoming"}</h4>
                    </div>

                    <div style={{ backgroundColor: "#F8F9FC", padding: "12px", borderRadius: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#646B7C" }}>Upcoming Bookings</span>
                      <h4 style={{ margin: "4px 0 0", fontSize: "16px" }}>{activeRentals.length} Bookings</h4>
                    </div>

                    <div style={{ backgroundColor: "#F8F9FC", padding: "12px", borderRadius: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#646B7C" }}>Active Blocks (Cleaning/Maint)</span>
                      <h4 style={{ margin: "4px 0 0", fontSize: "16px" }}>{activeBlocks.length} Active</h4>
                    </div>
                  </div>
                </s-box>
              </s-section>

              {/* 2-Column Split: Instant Date Checker & Manual Date Blocker Form */}
              <s-section>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

                  {/* Column 1: Instant Date Checker */}
                  <s-box padding="base" borderWidth="base" borderRadius="base">
                    <h4 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: "700" }}>
                      🔎 Instant Date Availability Checker
                    </h4>
                    <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "#646B7C" }}>
                      Verify if this outfit is available before taking custom customer inquiries or phone bookings.
                    </p>

                    <Form method="get">
                      <input type="hidden" name="tab" value="inspector" />
                      <input type="hidden" name="productId" value={selectedProduct.id} />
                      <input type="hidden" name="search" value={search} />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Pickup Date</label>
                          <input
                            type="date"
                            name="checkPickup"
                            defaultValue={checkPickup}
                            required
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Return Date</label>
                          <input
                            type="date"
                            name="checkReturn"
                            defaultValue={checkReturn}
                            required
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                      </div>

                      <s-button type="submit" style={{ width: "100%" }}>Check Availability</s-button>
                    </Form>

                    {/* Checker Result Display */}
                    {checkResult && (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "14px",
                          borderRadius: "8px",
                          backgroundColor: checkResult.isAvailable ? "#e3f5e1" : "#ffe4e6",
                          border: `1px solid ${checkResult.isAvailable ? "#bbf7d0" : "#fecdd3"}`,
                        }}
                      >
                        <strong style={{ display: "block", fontSize: "14px", color: checkResult.isAvailable ? "#166534" : "#9f1239" }}>
                          {checkResult.isAvailable ? "🎉 Outfit is Available!" : "⚠️ Unavailable for these dates"}
                        </strong>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: checkResult.isAvailable ? "#166534" : "#9f1239" }}>
                          {checkResult.message}
                        </p>

                        {/* Admin detailed conflicts breakdown */}
                        {!checkResult.isAvailable && checkResult.conflicts?.length > 0 && (
                          <div style={{ marginTop: "10px", fontSize: "12px", borderTop: "1px dashed #fecdd3", paddingTop: "8px" }}>
                            <strong>Conflicting Operational Entries:</strong>
                            <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                              {checkResult.conflicts.map((c, i) => (
                                <li key={i}>
                                  <strong>{formatReasonLabel(c.reason || c.type)}:</strong> {formatDisplayDate(c.startDate)} to {formatDisplayDate(c.endDate)}
                                  {c.customerName ? ` (${c.customerName})` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </s-box>

                  {/* Column 2: Manual Date Blocker Form */}
                  <s-box padding="base" borderWidth="base" borderRadius="base">
                    <h4 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: "700" }}>
                      🔒 Block Dates for this Outfit
                    </h4>
                    <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "#646B7C" }}>
                      Block single date or date ranges for In-Store Bookings, Dry Cleaning, Fitting, or Maintenance.
                    </p>

                    <Form method="post">
                      <input type="hidden" name="_action" value="block_dates" />
                      <input type="hidden" name="productId" value={selectedProduct.id} />
                      <input type="hidden" name="productTitle" value={selectedProduct.title} />

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Start Date *</label>
                          <input
                            type="date"
                            name="startDate"
                            required
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>End Date *</label>
                          <input
                            type="date"
                            name="endDate"
                            required
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Block Reason *</label>
                        <select
                          name="reason"
                          required
                          style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
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

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Customer Name (Optional)</label>
                          <input
                            type="text"
                            name="customerName"
                            placeholder="e.g. Rahul Sharma"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Phone (Optional)</label>
                          <input
                            type="text"
                            name="customerPhone"
                            placeholder="e.g. 9876543210"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: "12px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Internal Operational Note</label>
                        <input
                          type="text"
                          name="internalNote"
                          placeholder="e.g. Blouse alteration for reception; dry cleaning at City Centre branch"
                          style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                        />
                      </div>

                      <s-button type="submit" style={{ width: "100%" }}>Block Dates</s-button>
                    </Form>
                  </s-box>

                </div>
              </s-section>

              {/* Unified Schedule Table: Bookings & Active Blocks for this Product */}
              <s-section heading={`Upcoming Bookings & Blocked Dates Schedule (${activeRentals.length + activeBlocks.length})`}>
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  {activeRentals.length === 0 && activeBlocks.length === 0 ? (
                    <p style={{ margin: 0, padding: "16px", color: "#646B7C", textAlign: "center" }}>
                      No active bookings or date blocks for this outfit. It is completely available for rent!
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#F8F9FC", borderBottom: "2px solid #E2E4EB", textAlign: "left" }}>
                            <th style={{ padding: "12px" }}>Type / Reason</th>
                            <th style={{ padding: "12px" }}>Dates Range</th>
                            <th style={{ padding: "12px" }}>Duration</th>
                            <th style={{ padding: "12px" }}>Customer / Staff Note</th>
                            <th style={{ padding: "12px", textAlign: "right" }}>Action</th>
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
                              <tr key={b.id} style={{ borderBottom: "1px solid #E2E4EB" }}>
                                <td style={{ padding: "12px" }}>
                                  <span
                                    style={{
                                      backgroundColor: color + "18",
                                      color: color,
                                      border: `1px solid ${color}40`,
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    {formatReasonLabel(b.reason)}
                                  </span>
                                </td>
                                <td style={{ padding: "12px", fontWeight: "600" }}>
                                  {formatDisplayDate(b.startDate)} ➔ {formatDisplayDate(b.endDate)}
                                </td>
                                <td style={{ padding: "12px" }}>{days} Days</td>
                                <td style={{ padding: "12px", color: "#2E3346" }}>
                                  {b.customerName && <div><strong>Customer:</strong> {b.customerName} {b.customerPhone ? `(${b.customerPhone})` : ""}</div>}
                                  {b.internalNote && <div style={{ fontSize: "12px", color: "#646B7C" }}>{b.internalNote}</div>}
                                  {!b.customerName && !b.internalNote && <span style={{ color: "#999" }}>—</span>}
                                </td>
                                <td style={{ padding: "12px", textAlign: "right" }}>
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
                                      style={{
                                        backgroundColor: "#fef2f2",
                                        border: "1px solid #f87171",
                                        color: "#b91c1c",
                                        padding: "4px 10px",
                                        borderRadius: "6px",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        cursor: "pointer",
                                      }}
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
                              <tr key={r.id} style={{ borderBottom: "1px solid #E2E4EB" }}>
                                <td style={{ padding: "12px" }}>
                                  <span
                                    style={{
                                      backgroundColor: r.status === "OFFLINE_BOOKED" ? "#ffedd5" : "#fee2e2",
                                      color: r.status === "OFFLINE_BOOKED" ? "#c2410c" : "#b91c1c",
                                      border: `1px solid ${r.status === "OFFLINE_BOOKED" ? "#fdba74" : "#fca5a5"}`,
                                      padding: "3px 8px",
                                      borderRadius: "6px",
                                      fontSize: "12px",
                                      fontWeight: "700",
                                    }}
                                  >
                                    {r.status === "OFFLINE_BOOKED" ? "🏬 In-Store Booking" : "🔴 Customer Online Rental"}
                                  </span>
                                </td>
                                <td style={{ padding: "12px", fontWeight: "600" }}>
                                  {formatDisplayDate(r.pickupDate)} ➔ {formatDisplayDate(r.returnDate)}
                                </td>
                                <td style={{ padding: "12px" }}>{days} Days</td>
                                <td style={{ padding: "12px" }}>
                                  <div><strong>{r.customerName}</strong> ({r.customerPhone})</div>
                                  <div style={{ fontSize: "11px", color: "#646B7C" }}>Booking ID: {r.bookingId || r.id.slice(-6)}</div>
                                </td>
                                <td style={{ padding: "12px", textAlign: "right" }}>
                                  <Link
                                    to={`/app/rentals/${r.id}`}
                                    style={{ fontSize: "12px", color: "#7964FF", fontWeight: "600", textDecoration: "none" }}
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
                </s-box>
              </s-section>
            </>
          ) : (
            <s-section>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <p style={{ margin: 0, textAlign: "center", color: "#646B7C" }}>
                  No products found. Please search for an outfit to view and manage its availability.
                </p>
              </s-box>
            </s-section>
          )}
        </>
      )}

      {/* =========================================================================
          TAB 2: BULK DATE BLOCKING
          ========================================================================= */}
      {currentTab === "bulk" && (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "700" }}>
              📦 Bulk Date Blocking Across Multiple Outfits
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#646B7C" }}>
              Select multiple dresses or jewellery sets to block them simultaneously for maintenance, seasonal dry cleaning, or bulk hold.
            </p>

            <Form method="post">
              <input type="hidden" name="_action" value="bulk_block" />
              <input type="hidden" name="productIds" value={selectedProductIds.join(",")} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Start Date *</label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>End Date *</label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Block Reason *</label>
                  <select
                    name="reason"
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
                  >
                    <option value="MAINTENANCE">⚫ Maintenance, Steaming & Repair</option>
                    <option value="CLEANING">🧼 Cleaning & Washing</option>
                    <option value="CUSTOMER_HOLD">🟡 Customer Hold</option>
                    <option value="OFFLINE_BOOKING">🏬 Offline / In-Store Booking</option>
                    <option value="OTHER">📝 Other</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Internal Note</label>
                <input
                  type="text"
                  name="internalNote"
                  placeholder="e.g. Scheduled deep dry-cleaning post wedding rush"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              {/* Product Selection List */}
              <div style={{ border: "1px solid #E2E4EB", borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                <div style={{ padding: "10px 14px", backgroundColor: "#F8F9FC", borderBottom: "1px solid #E2E4EB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Select Outfits ({selectedProductIds.length} Selected)</strong>
                  <button
                    type="button"
                    onClick={selectAllProducts}
                    style={{ background: "transparent", border: "0", color: "#7964FF", fontWeight: "600", cursor: "pointer", fontSize: "12px" }}
                  >
                    {selectedProductIds.length === products.length ? "Deselect All" : "Select All Products"}
                  </button>
                </div>

                <div style={{ maxHeight: "320px", overflowY: "auto", padding: "8px 14px" }}>
                  {products.map((p) => (
                    <label
                      key={p.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 0",
                        borderBottom: "1px solid #F0EEFF",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(p.id)}
                        onChange={() => toggleSelectProduct(p.id)}
                      />
                      <span>{p.title}</span>
                      <span style={{ fontSize: "12px", color: "#999", marginLeft: "auto" }}>₹{p.variants?.nodes[0]?.price || ""}</span>
                    </label>
                  ))}
                </div>
              </div>

              <s-button type="submit" disabled={selectedProductIds.length === 0}>
                Block Selected ({selectedProductIds.length}) Products
              </s-button>
            </Form>
          </s-box>
        </s-section>
      )}

      {/* =========================================================================
          TAB 3: STORE-WIDE BLOCKED INVENTORY
          ========================================================================= */}
      {currentTab === "storewide" && (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>
                  📋 Store-Wide Blocked Inventory ({storeWideBlocks.length})
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#646B7C" }}>
                  Live overview of all outfits currently blocked across the catalog (at dry cleaner, in alteration, or offline booked).
                </p>
              </div>
            </div>

            {storeWideBlocks.length === 0 ? (
              <p style={{ margin: 0, padding: "20px", textAlign: "center", color: "#646B7C" }}>
                No active blocks across the store. All outfits without bookings are currently available for customers!
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#F8F9FC", borderBottom: "2px solid #E2E4EB", textAlign: "left" }}>
                      <th style={{ padding: "12px" }}>Outfit / Product</th>
                      <th style={{ padding: "12px" }}>Reason</th>
                      <th style={{ padding: "12px" }}>Blocked Dates</th>
                      <th style={{ padding: "12px" }}>Customer / Staff Note</th>
                      <th style={{ padding: "12px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storeWideBlocks.map((b) => {
                      const color = getReasonColor(b.reason);
                      return (
                        <tr key={b.id} style={{ borderBottom: "1px solid #E2E4EB" }}>
                          <td style={{ padding: "12px", fontWeight: "600" }}>
                            <Link
                              to={`/app/availability?productId=${encodeURIComponent(b.productId)}&tab=inspector`}
                              style={{ color: "#2E3346", textDecoration: "none" }}
                            >
                              {b.productTitle || b.productId} ➔
                            </Link>
                          </td>
                          <td style={{ padding: "12px" }}>
                            <span
                              style={{
                                backgroundColor: color + "18",
                                color: color,
                                border: `1px solid ${color}40`,
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: "700",
                              }}
                            >
                              {formatReasonLabel(b.reason)}
                            </span>
                          </td>
                          <td style={{ padding: "12px" }}>
                            {formatDisplayDate(b.startDate)} ➔ {formatDisplayDate(b.endDate)}
                          </td>
                          <td style={{ padding: "12px", color: "#646B7C" }}>
                            {b.customerName && <div><strong>{b.customerName}</strong> {b.customerPhone ? `(${b.customerPhone})` : ""}</div>}
                            {b.internalNote && <div style={{ fontSize: "12px" }}>{b.internalNote}</div>}
                            {!b.customerName && !b.internalNote && "—"}
                          </td>
                          <td style={{ padding: "12px", textAlign: "right" }}>
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
                                style={{
                                  backgroundColor: "#fef2f2",
                                  border: "1px solid #f87171",
                                  color: "#b91c1c",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                }}
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
          </s-box>
        </s-section>
      )}

      {/* =========================================================================
          TAB 4: AVAILABILITY SEARCH BY DATE & CATEGORY
          ========================================================================= */}
      {currentTab === "search_dates" && (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <h3 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: "700" }}>
              🔎 Search Available Outfits by Date & Category
            </h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#646B7C" }}>
              Instantly discover which outfits are free for a customer's specific event dates.
            </p>

            <Form method="get">
              <input type="hidden" name="tab" value="search_dates" />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "14px", alignItems: "flex-end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Event / Pickup Date *</label>
                  <input
                    type="date"
                    name="searchFrom"
                    defaultValue={searchFrom}
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Return Date *</label>
                  <input
                    type="date"
                    name="searchTo"
                    defaultValue={searchTo}
                    required
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>Category</label>
                  <select
                    name="searchCategory"
                    defaultValue={searchCategory}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "13px" }}
                  >
                    <option value="ALL">All Categories</option>
                    <option value="lehenga">Lehenga</option>
                    <option value="sherwani">Sherwani</option>
                    <option value="gown">Gown</option>
                    <option value="saree">Saree</option>
                    <option value="jewellery">Jewellery</option>
                  </select>
                </div>
                <s-button type="submit">Search Availability</s-button>
              </div>
            </Form>

            {/* Results Counters & Listing */}
            {searchDatesResult && (
              <div style={{ marginTop: "24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                  <div style={{ backgroundColor: "#e3f5e1", border: "1px solid #bbf7d0", padding: "14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#166534" }}>Available to Rent</span>
                    <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#166534" }}>{searchDatesResult.availableItems.length} Outfits</h3>
                  </div>

                  <div style={{ backgroundColor: "#fee2e2", border: "1px solid #fca5a5", padding: "14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#b91c1c" }}>Customer Booked</span>
                    <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#b91c1c" }}>{searchDatesResult.bookedItems.length} Outfits</h3>
                  </div>

                  <div style={{ backgroundColor: "#ffedd5", border: "1px solid #fdba74", padding: "14px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#c2410c" }}>Blocked (Cleaning/Maint)</span>
                    <h3 style={{ margin: "4px 0 0", fontSize: "22px", color: "#c2410c" }}>{searchDatesResult.blockedItems.length} Outfits</h3>
                  </div>
                </div>

                <h4 style={{ margin: "0 0 10px", fontSize: "16px", fontWeight: "700" }}>
                  🟢 Available Outfits ({searchDatesResult.availableItems.length})
                </h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
                  {searchDatesResult.availableItems.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        border: "1px solid #bbf7d0",
                        borderRadius: "8px",
                        padding: "12px",
                        backgroundColor: "#f0fdf4",
                      }}
                    >
                      <strong style={{ display: "block", fontSize: "14px", marginBottom: "4px" }}>{p.title}</strong>
                      <span style={{ fontSize: "12px", color: "#166534" }}>₹{p.variants?.nodes[0]?.price || ""}</span>
                      <div style={{ marginTop: "8px" }}>
                        <Link
                          to={`/app/availability?productId=${encodeURIComponent(p.id)}&tab=inspector`}
                          style={{ fontSize: "11.5px", color: "#7964FF", fontWeight: "600", textDecoration: "none" }}
                        >
                          Inspect & Block ➔
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </s-box>
        </s-section>
      )}

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
