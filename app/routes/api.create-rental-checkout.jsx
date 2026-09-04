import { unauthenticated } from "../shopify.server.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ status: "active", message: "Rental Draft Order Checkout API is operational." }),
    { status: 200, headers: corsHeaders }
  );
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body = {};
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData);
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON payload." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { shop, items, customerEmail, customerPhone, customerName } = body;

  if (!shop) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required 'shop' parameter." }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Normalize items array (support either single-item body or multi-item array)
  let rentalItems = [];
  if (Array.isArray(items) && items.length > 0) {
    rentalItems = items;
  } else if (body.productId) {
    rentalItems = [{
      productId: body.productId,
      productTitle: body.productTitle || "Rental Outfit",
      variantId: body.variantId,
      rentalPrice: parseFloat(body.rentalPrice) || 0,
      securityDeposit: parseFloat(body.securityDeposit) || 0,
      pickupDate: body.pickupDate,
      returnDate: body.returnDate,
      bookingId: body.bookingId,
      itemType: body.itemType || "Outfit",
      quantity: 1,
    }];
  }

  if (rentalItems.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No rental items specified." }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Construct draft order line items (Item Rental + Refundable Security Deposit item)
  const lineItems = [];
  let totalDeposit = 0;
  let totalRent = 0;
  const bookingIds = [];

  for (const item of rentalItems) {
    const qty = parseInt(item.quantity) || 1;
    const rPrice = parseFloat(item.rentalPrice) || 0;
    const sDeposit = parseFloat(item.securityDeposit) || 0;
    totalRent += rPrice * qty;
    totalDeposit += sDeposit * qty;

    if (item.bookingId) {
      bookingIds.push(item.bookingId);
    }

    const itemProps = [
      { key: "Rental Pickup Date", value: String(item.pickupDate || "") },
      { key: "Rental Return Date", value: String(item.returnDate || "") },
      { key: "Rental Booking ID", value: String(item.bookingId || "") },
      { key: "Item Type", value: String(item.itemType || "Outfit") },
      { key: "Booking Type", value: "Rental" },
      { key: "Rental Price", value: `₹${rPrice.toLocaleString("en-IN")}` },
      { key: "Security Deposit (Refundable)", value: `₹${sDeposit.toLocaleString("en-IN")}` },
    ];

    // 1. Product line item
    if (item.variantId) {
      const formattedVariantId = String(item.variantId).startsWith("gid://")
        ? item.variantId
        : `gid://shopify/ProductVariant/${item.variantId}`;

      lineItems.push({
        variantId: formattedVariantId,
        quantity: qty,
        customAttributes: itemProps,
      });
    } else {
      lineItems.push({
        title: `${item.productTitle || "Rental Item"} (Rental)`,
        originalUnitPrice: rPrice.toFixed(2),
        quantity: qty,
        requiresShipping: true,
        customAttributes: itemProps,
      });
    }

    // 2. Refundable Security Deposit line item (added directly to the bill!)
    if (sDeposit > 0) {
      lineItems.push({
        title: `Refundable Security Deposit - ${item.productTitle || item.itemType || "Outfit"}`,
        originalUnitPrice: sDeposit.toFixed(2),
        quantity: qty,
        requiresShipping: false,
        taxable: false,
        customAttributes: [
          { key: "Type", value: "Refundable Security Deposit" },
          { key: "Related Item", value: String(item.productTitle || "") },
          { key: "Rental Booking ID", value: String(item.bookingId || "") },
          { key: "Return Condition", value: "Refunded back upon safe return" },
        ],
      });
    }
  }

  // Create Shopify Draft Order via Admin GraphQL API
  try {
    const { admin } = await unauthenticated.admin(shop);

    const draftOrderInput = {
      lineItems,
      note: `Rental Booking(s): ${bookingIds.join(", ")} | Security Deposit Total: ₹${totalDeposit} (Refundable upon return)`,
      tags: ["Rental", "Online Booking", "Deposit Included", ...bookingIds],
    };

    if (customerEmail) {
      draftOrderInput.email = customerEmail;
    }

    const response = await admin.graphql(
      `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
      { variables: { input: draftOrderInput } }
    );

    const result = await response.json();
    const data = result.data?.draftOrderCreate;

    if (data?.userErrors && data.userErrors.length > 0) {
      const errMsg = data.userErrors.map((e) => e.message).join(", ");
      console.error("DraftOrder userErrors:", errMsg);
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (data?.draftOrder?.invoiceUrl) {
      return new Response(
        JSON.stringify({
          success: true,
          checkoutUrl: data.draftOrder.invoiceUrl,
          draftOrderId: data.draftOrder.id,
          totalAmount: data.draftOrder.totalPriceSet?.shopMoney?.amount || (totalRent + totalDeposit),
          bookingIds,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Could not obtain invoiceUrl from Shopify." }),
      { status: 500, headers: corsHeaders }
    );
  } catch (apiErr) {
    console.error("Draft order creation exception:", apiErr);
    return new Response(
      JSON.stringify({
        success: false,
        error: apiErr.message || "Failed to communicate with Shopify Draft Order API.",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};
