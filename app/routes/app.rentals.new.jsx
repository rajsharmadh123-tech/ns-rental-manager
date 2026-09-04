import { useLoaderData, useActionData, Form, Link, redirect } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";
import { generateBookingId } from "../utils/rental.server.js";
import { checkProductAvailability } from "../utils/availability.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Generate new booking ID preview
  const nextBookingId = await generateBookingId(session.shop);

  // Fetch Shopify products for selection
  let products = [];
  try {
    const response = await admin.graphql(`
      {
        products(first: 50) {
          nodes {
            id
            title
            variants(first: 10) {
              nodes {
                id
                title
                price
              }
            }
          }
        }
      }
    `);
    const json = await response.json();
    products = json.data?.products?.nodes || [];
  } catch (err) {
    console.error("Failed to fetch Shopify products:", err);
  }

  // Fetch rental product configurations if any
  const productConfigs = await prisma.rentalProductConfig.findMany({
    where: { shop: session.shop },
  });

  return {
    nextBookingId,
    products,
    productConfigs,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const customerName = formData.get("customerName")?.trim();
  const customerPhone = formData.get("customerPhone")?.trim();
  const whatsappNumber = formData.get("whatsappNumber")?.trim() || customerPhone;
  const customerEmail = formData.get("customerEmail")?.trim();
  const customerAddress = formData.get("customerAddress")?.trim();

  const productId = formData.get("productId");
  const productTitle = formData.get("productTitle");
  const variantId = formData.get("variantId") || "";

  const pickupDateStr = formData.get("pickupDate");
  const returnDateStr = formData.get("returnDate");

  const rentalPrice = parseFloat(formData.get("rentalPrice")) || 0;
  const securityDeposit = parseFloat(formData.get("securityDeposit")) || 0;
  const discount = parseFloat(formData.get("discount")) || 0;
  const status = formData.get("status") || "PENDING";
  const paymentStatus = formData.get("paymentStatus") || "UNPAID";
  const notes = formData.get("notes")?.trim();

  if (!customerName || !customerPhone || !productTitle || !pickupDateStr || !returnDateStr) {
    return { error: "Please fill in all required fields (Customer Name, Phone, Product, Pickup & Return dates)." };
  }

  const pickupDate = new Date(pickupDateStr);
  const returnDate = new Date(returnDateStr);

  if (returnDate < pickupDate) {
    return { error: "Return Date cannot be before Pickup Date." };
  }

  // Server-side Double Booking Protection Check
  if (status !== "CANCELLED") {
    const availability = await checkProductAvailability({
      shop: session.shop,
      productId: productId || productTitle, // Fallback to product title if custom
      variantId,
      pickupDate,
      returnDate,
    });

    if (!availability.isAvailable) {
      return { error: availability.message };
    }
  }

  const finalAmount = Math.max(0, rentalPrice - discount);
  const bookingId = await generateBookingId(session.shop);

  // Sync / Upsert Customer record
  let customer = await prisma.customer.findFirst({
    where: { shop: session.shop, phone: customerPhone },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        shop: session.shop,
        name: customerName,
        phone: customerPhone,
        whatsapp: whatsappNumber,
        email: customerEmail,
        address: customerAddress,
      },
    });
  }

  // Create Rental
  const rental = await prisma.rental.create({
    data: {
      bookingId,
      shop: session.shop,
      productId: productId || "custom",
      productTitle,
      variantId,
      customerName,
      customerPhone,
      whatsappNumber,
      customerEmail,
      customerAddress,
      pickupDate,
      returnDate,
      rentalPrice,
      securityDeposit,
      discount,
      finalAmount,
      status,
      paymentStatus,
      notes,
      customerId: customer.id,
    },
  });

  return redirect(`/app/rentals/${rental.id}`);
};

export default function NewRental() {
  const { nextBookingId, products } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Create New Rental Booking">
      <s-button slot="primary-action" href="/app/rentals">
        ← Back to Rentals
      </s-button>

      {actionData?.error && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#ffe4e6", color: "#9f1239", borderRadius: "8px", fontWeight: "600" }}>
            ⚠️ {actionData.error}
          </div>
        </s-section>
      )}

      <Form method="post">
        <s-section heading={`Booking ID: ${nextBookingId}`}>

          {/* Customer Details */}
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
            <s-heading>1. Customer Details</s-heading>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Customer Name *
                </label>
                <input
                  type="text"
                  name="customerName"
                  required
                  placeholder="e.g. Priya Sharma"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  name="customerPhone"
                  required
                  placeholder="e.g. 9876543210"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  WhatsApp Number
                </label>
                <input
                  type="tel"
                  name="whatsappNumber"
                  placeholder="Same as mobile if left blank"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Email Address
                </label>
                <input
                  type="email"
                  name="customerEmail"
                  placeholder="priya@example.com"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                Full Address
              </label>
              <textarea
                name="customerAddress"
                rows="2"
                placeholder="House / Street / City / Pincode"
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>
          </s-box>

          {/* Outfit / Product Selection */}
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
            <s-heading>2. Product & Dates</s-heading>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px" }}>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Select Outfit / Product *
                </label>
                {products.length > 0 ? (
                  <select
                    name="productTitle"
                    required
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  >
                    <option value="">-- Choose Shopify Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.title}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    name="productTitle"
                    required
                    placeholder="Enter Outfit Name (e.g. Red Heavy Bridal Lehenga)"
                    style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Variant / Size
                </label>
                <input
                  type="text"
                  name="variantId"
                  placeholder="e.g. Size M / Standard"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Pickup Date *
                </label>
                <input
                  type="date"
                  name="pickupDate"
                  required
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Return Date *
                </label>
                <input
                  type="date"
                  name="returnDate"
                  required
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

            </div>
          </s-box>

          {/* Pricing & Status */}
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ marginBottom: "16px" }}>
            <s-heading>3. Pricing & Status</s-heading>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginTop: "12px" }}>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Rental Price (₹) *
                </label>
                <input
                  type="number"
                  name="rentalPrice"
                  step="0.01"
                  required
                  placeholder="5500"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Security Deposit (₹)
                </label>
                <input
                  type="number"
                  name="securityDeposit"
                  step="0.01"
                  defaultValue="2000"
                  placeholder="2000"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Discount (₹)
                </label>
                <input
                  type="number"
                  name="discount"
                  step="0.01"
                  defaultValue="0"
                  placeholder="0"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Booking Status
                </label>
                <select
                  name="status"
                  defaultValue="PENDING"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                >
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                  <option value="PICKED_UP">Picked Up / Active</option>
                  <option value="RETURNED">Returned</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                  Payment Status
                </label>
                <select
                  name="paymentStatus"
                  defaultValue="UNPAID"
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                >
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="PAID">Paid</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
              </div>

            </div>

            <div style={{ marginTop: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: "600", fontSize: "14px" }}>
                Notes / Fitting Instructions
              </label>
              <textarea
                name="notes"
                rows="2"
                placeholder="Blouse measurement details, alteration instructions, special requests..."
                style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
              />
            </div>
          </s-box>

          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button type="submit" className="gm-btn-primary" style={{ fontSize: "14px" }}>+ Save & Create Booking</button>
            <Link to="/app/rentals" style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #ccc", textDecoration: "none", color: "#555", fontWeight: "600" }}>Cancel</Link>
          </div>

        </s-section>
      </Form>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
