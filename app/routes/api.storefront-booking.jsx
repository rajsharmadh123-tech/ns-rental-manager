import prisma from "../db.server.js";
import { checkProductAvailability } from "../utils/availability.server.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(JSON.stringify({ message: "Storefront Booking API endpoint active." }), {
    status: 200,
    headers: corsHeaders,
  });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body = {};
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData);
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid payload format." }),
      { status: 400, headers: corsHeaders }
    );
  }

  const {
    shop,
    customerName,
    customerPhone,
    customerEmail,
    productId,
    productTitle,
    variantId,
    pickupDate,
    returnDate,
    notes,
    rentalPrice,
    securityDeposit,
  } = body;

  // 1. Input Validation
  if (!shop || !customerName || !customerPhone || !productId || !pickupDate || !returnDate) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing required fields: shop, customerName, customerPhone, productId, pickupDate, returnDate.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  const pDate = new Date(pickupDate);
  const rDate = new Date(returnDate);

  if (isNaN(pDate.getTime()) || isNaN(rDate.getTime())) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid date format." }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (rDate < pDate) {
    return new Response(
      JSON.stringify({ success: false, error: "Return date must be on or after pickup date." }),
      { status: 400, headers: corsHeaders }
    );
  }

  // 2. Server-side Double Booking Protection
  const availability = await checkProductAvailability({
    shop,
    productId: String(productId),
    variantId: variantId ? String(variantId) : "",
    pickupDate,
    returnDate,
  });

  if (!availability.isAvailable) {
    return new Response(
      JSON.stringify({
        success: false,
        error: availability.message || "Selected outfit is unavailable for these dates.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  // 3. Find or Create Customer
  let customer = await prisma.customer.findUnique({
    where: {
      shop_phone: {
        shop,
        phone: String(customerPhone).trim(),
      },
    },
  });

  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        shop,
        name: String(customerName).trim(),
        phone: String(customerPhone).trim(),
        email: customerEmail ? String(customerEmail).trim() : null,
      },
    });
  }

  // 4. Generate Sequential Booking ID
  const count = await prisma.rental.count({ where: { shop } });
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(4, "0");
  const bookingId = `GM-${year}-${seq}`;

  // 5. Determine Prices
  const rPrice = parseFloat(rentalPrice) || 0;
  const sDeposit = parseFloat(securityDeposit) || 0;

  // 6. Create Rental Record
  const newRental = await prisma.rental.create({
    data: {
      shop,
      bookingId,
      productId: String(productId),
      productTitle: String(productTitle || "Outfit"),
      variantId: variantId ? String(variantId) : null,
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone).trim(),
      customerEmail: customerEmail ? String(customerEmail).trim() : null,
      pickupDate: pDate,
      returnDate: rDate,
      rentalPrice: rPrice,
      securityDeposit: sDeposit,
      finalAmount: rPrice,
      status: "PENDING",
      paymentStatus: "UNPAID",
      notes: notes ? String(notes).trim() : "Submitted via Storefront Rental Widget",
      customerId: customer.id,
    },
  });

  return new Response(
    JSON.stringify({
      success: true,
      bookingId: newRental.bookingId,
      message: `Booking request ${newRental.bookingId} submitted successfully! Our team will contact you shortly.`,
    }),
    { status: 201, headers: corsHeaders }
  );
};
