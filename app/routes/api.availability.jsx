import { checkProductAvailability } from "../utils/availability.server.js";

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

  if (!shop || !productId || !pickupDate || !returnDate) {
    return new Response(
      JSON.stringify({
        isAvailable: false,
        message: "Missing required parameters: shop, productId, pickupDate, returnDate.",
      }),
      { status: 400, headers: corsHeaders }
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
    }),
    { status: 200, headers: corsHeaders }
  );
};
