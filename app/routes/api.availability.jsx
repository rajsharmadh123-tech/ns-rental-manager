import { checkProductAvailability } from "../utils/availability.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId") || "";
  const pickupDate = url.searchParams.get("pickupDate");
  const returnDate = url.searchParams.get("returnDate");

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!shop || !productId) {
    return new Response(
      JSON.stringify({
        isAvailable: false,
        message: "Missing required parameters: shop, productId.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Fetch individual product pricing & security deposit from database
  let rentalPrice = null;
  let securityDeposit = null;

  try {
    const pConfig = await prisma.rentalProductConfig.findFirst({
      where: {
        shop,
        productId: { contains: String(productId) },
      },
    });

    if (pConfig) {
      if (pConfig.rentalPrice !== undefined && pConfig.rentalPrice !== null) {
        rentalPrice = pConfig.rentalPrice;
      }
      if (pConfig.securityDeposit !== undefined && pConfig.securityDeposit !== null) {
        securityDeposit = pConfig.securityDeposit;
      }
    }
  } catch (e) {
    console.warn("Error fetching product rental config:", e);
  }

  if (!pickupDate || !returnDate) {
    return new Response(
      JSON.stringify({
        isAvailable: true,
        message: "Select dates to check availability.",
        rentalPrice,
        securityDeposit,
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  const result = await checkProductAvailability({
    shop,
    productId,
    variantId,
    pickupDate,
    returnDate,
  });

  return new Response(
    JSON.stringify({
      isAvailable: result.isAvailable,
      message: result.message,
      conflictingCount: result.conflictingRentals.length,
      rentalPrice,
      securityDeposit,
    }),
    { status: 200, headers: corsHeaders }
  );
};
