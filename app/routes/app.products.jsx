import { useLoaderData, useActionData, Form } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch Shopify products
  let products = [];
  try {
    const response = await admin.graphql(`
      {
        products(first: 50) {
          nodes {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
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
    console.error("Error fetching Shopify products:", err);
  }

  // Fetch product configurations from database
  const configs = await prisma.rentalProductConfig.findMany({
    where: { shop: session.shop },
  });

  const configMap = {};
  for (const c of configs) {
    configMap[c.productId] = c;
  }

  return {
    products,
    configMap,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId");
  const rentalPrice = parseFloat(formData.get("rentalPrice")) || 0;
  const securityDeposit = parseFloat(formData.get("securityDeposit")) || 0;
  const isEnabled = formData.get("isEnabled") === "true";
  const notes = formData.get("notes")?.trim();

  if (!productId) {
    return { error: "Invalid product selected." };
  }

  await prisma.rentalProductConfig.upsert({
    where: {
      shop_productId_variantId: {
        shop: session.shop,
        productId,
        variantId: "",
      },
    },
    update: {
      rentalPrice,
      securityDeposit,
      isEnabled,
      notes,
    },
    create: {
      shop: session.shop,
      productId,
      variantId: "",
      rentalPrice,
      securityDeposit,
      isEnabled,
      notes,
    },
  });

  return { success: "Rental product pricing & availability saved successfully!" };
};

export default function RentalProducts() {
  const { products, configMap } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Rental Product Management">

      <s-section>
        <s-heading>Shopify Outfits & Rental Configurations</s-heading>
        <s-paragraph>
          Configure rental pricing, security deposit, and rental availability for your Shopify store items.
        </s-paragraph>
      </s-section>

      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      <s-section heading={`Store Products (${products.length})`}>
        {products.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No products found in your Shopify catalog.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
            {products.map((p) => {
              const cfg = configMap[p.id] || {};
              const isEnabled = cfg.isEnabled !== undefined ? cfg.isEnabled : true;
              const defaultRentalPrice = cfg.rentalPrice !== undefined ? cfg.rentalPrice : (parseFloat(p.variants?.nodes[0]?.price) || 0) * 0.3;
              const defaultDeposit = cfg.securityDeposit !== undefined ? cfg.securityDeposit : 2000;

              return (
                <s-box key={p.id} padding="base" borderWidth="base" borderRadius="base">
                  <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                    {p.featuredImage?.url ? (
                      <img
                        src={p.featuredImage.url}
                        alt={p.featuredImage.altText || p.title}
                        style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "6px" }}
                      />
                    ) : (
                      <div style={{ width: "64px", height: "64px", backgroundColor: "#eee", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                        👗
                      </div>
                    )}
                    <div>
                      <h4 style={{ margin: "0 0 4px", fontSize: "16px" }}>{p.title}</h4>
                      <span style={{ fontSize: "12px", color: "#666" }}>
                        Shopify Price: ₹{p.variants?.nodes[0]?.price || "N/A"}
                      </span>
                    </div>
                  </div>

                  <Form method="post">
                    <input type="hidden" name="productId" value={p.id} />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                          Rental Price (₹)
                        </label>
                        <input
                          type="number"
                          name="rentalPrice"
                          step="0.01"
                          defaultValue={defaultRentalPrice}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", boxSizing: "border-box" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                          Security Deposit (₹)
                        </label>
                        <input
                          type="number"
                          name="securityDeposit"
                          step="0.01"
                          defaultValue={defaultDeposit}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                        Rental Availability Status
                      </label>
                      <select
                        name="isEnabled"
                        defaultValue={isEnabled ? "true" : "false"}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc" }}
                      >
                        <option value="true">Available for Rent</option>
                        <option value="false">Disabled / Out of Service</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>
                        Rental Notes / Alterations
                      </label>
                      <input
                        type="text"
                        name="notes"
                        defaultValue={cfg.notes || ""}
                        placeholder="e.g. Blouse alteration available up to size 42"
                        style={{ width: "100%", padding: "6px 8px", borderRadius: "4px", border: "1px solid #ccc", boxSizing: "border-box" }}
                      />
                    </div>

                    <s-button type="submit" style={{ width: "100%" }}>Save Rental Pricing</s-button>
                  </Form>
                </s-box>
              );
            })}
          </div>
        )}
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
