import { useState } from "react";
import { useLoaderData, useActionData, Form, Link } from "react-router";
import { authenticate } from "../shopify.server.js";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Fetch active/picked up rentals waiting for return
  const returnQueue = await prisma.rental.findMany({
    where: {
      shop: session.shop,
      status: {
        in: ["PICKED_UP", "ACTIVE"],
      },
    },
    orderBy: { returnDate: "asc" },
  });

  return { returnQueue };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const rentalId = formData.get("rentalId");
  const actualReturnDateStr = formData.get("actualReturnDate");
  const productCondition = formData.get("productCondition") || "GOOD";
  const damageFee = parseFloat(formData.get("damageFee")) || 0;
  const lateFee = parseFloat(formData.get("lateFee")) || 0;
  const depositDeduction = parseFloat(formData.get("depositDeduction")) || 0;
  const returnNotes = formData.get("returnNotes")?.trim();
  const targetStatus = formData.get("targetStatus") || "RETURNED";

  if (!rentalId) {
    return { error: "Invalid rental record selected." };
  }

  const rental = await prisma.rental.findUnique({
    where: { id: rentalId, shop: session.shop },
  });

  if (!rental) {
    return { error: "Rental record not found." };
  }

  const totalDeduction = damageFee + lateFee + depositDeduction;
  const refundableDeposit = Math.max(0, (rental.securityDeposit || 0) - totalDeduction);

  const actualReturnDate = actualReturnDateStr ? new Date(actualReturnDateStr) : new Date();

  await prisma.rental.update({
    where: { id: rentalId, shop: session.shop },
    data: {
      actualReturnDate,
      productCondition,
      damageFee,
      lateFee,
      depositDeduction,
      refundableDeposit,
      finalRefund: refundableDeposit,
      returnNotes,
      status: targetStatus,
    },
  });

  return { success: `Rental ${rental.bookingId || "record"} marked as ${targetStatus}! Refundable Deposit: ₹${refundableDeposit}` };
};

export default function ReturnManagement() {
  const { returnQueue } = useLoaderData();
  const actionData = useActionData();
  const [selectedRental, setSelectedRental] = useState(null);

  const [damageFee, setDamageFee] = useState(0);
  const [lateFee, setLateFee] = useState(0);
  const [depositDeduction, setDepositDeduction] = useState(0);

  const openInspection = (rental) => {
    setSelectedRental(rental);
    setDamageFee(rental.damageFee || 0);
    setLateFee(rental.lateFee || 0);
    setDepositDeduction(rental.depositDeduction || 0);
  };

  const closeInspection = () => {
    setSelectedRental(null);
  };

  const currentDeposit = selectedRental ? (selectedRental.securityDeposit || 0) : 0;
  const calculatedRefund = Math.max(0, currentDeposit - damageFee - lateFee - depositDeduction);

  return (
    <s-page heading="Return & Inspection Management">

      <s-section>
        <s-heading>Active Outfits Return Queue</s-heading>
        <s-paragraph>
          Perform outfit quality inspection, calculate damage/late charges, and process security deposit refunds.
        </s-paragraph>
      </s-section>

      {actionData?.success && (
        <s-section>
          <div style={{ padding: "12px", backgroundColor: "#e3f5e1", color: "#166534", borderRadius: "8px", fontWeight: "600" }}>
            ✅ {actionData.success}
          </div>
        </s-section>
      )}

      {/* Return Inspection Modal / Card */}
      {selectedRental && (
        <s-section heading={`Inspection & Return: ${selectedRental.bookingId || selectedRental.customerName}`}>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ backgroundColor: "#f9fbfd", border: "2px solid #005bd3" }}>
            <s-stack direction="inline" justify="space-between" align="center">
              <div>
                <h3 style={{ margin: "0 0 4px" }}>Outfit: {selectedRental.productTitle}</h3>
                <span style={{ fontSize: "13px", color: "#666" }}>Customer: {selectedRental.customerName} ({selectedRental.customerPhone})</span>
              </div>
              <button
                type="button"
                onClick={closeInspection}
                style={{ padding: "6px 12px", border: "1px solid #ccc", background: "#fff", borderRadius: "6px", cursor: "pointer" }}
              >
                ✕ Close Form
              </button>
            </s-stack>

            <Form method="post" style={{ marginTop: "16px" }}>
              <input type="hidden" name="rentalId" value={selectedRental.id} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Actual Return Date
                  </label>
                  <input
                    type="date"
                    name="actualReturnDate"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    required
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Product Condition
                  </label>
                  <select
                    name="productCondition"
                    defaultValue="GOOD"
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  >
                    <option value="GOOD">Good / Fresh Condition</option>
                    <option value="DAMAGED">Damaged / Stained</option>
                    <option value="MISSING_ITEMS">Missing Accessories / Dupatta</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Security Deposit Paid
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={`₹${currentDeposit}`}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #eee", backgroundColor: "#eee", fontWeight: "600" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Damage Fee (₹)
                  </label>
                  <input
                    type="number"
                    name="damageFee"
                    step="0.01"
                    value={damageFee}
                    onChange={(e) => setDamageFee(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Late Return Fee (₹)
                  </label>
                  <input
                    type="number"
                    name="lateFee"
                    step="0.01"
                    value={lateFee}
                    onChange={(e) => setLateFee(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                    Other Deposit Deductions (₹)
                  </label>
                  <input
                    type="number"
                    name="depositDeduction"
                    step="0.01"
                    value={depositDeduction}
                    onChange={(e) => setDepositDeduction(parseFloat(e.target.value) || 0)}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" }}
                  />
                </div>

              </div>

              {/* Calculated Deposit Refund Summary */}
              <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "#e3f5e1", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: "12px", color: "#166534" }}>Calculated Refundable Security Deposit</span>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#166534" }}>
                    ₹{calculatedRefund.toLocaleString("en-IN")}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "#166534" }}>
                  (Deposit ₹{currentDeposit} - Charges ₹{damageFee + lateFee + depositDeduction})
                </span>
              </div>

              <div style={{ marginTop: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "600", fontSize: "13px" }}>
                  Return Notes & Damage Inspection Remarks
                </label>
                <textarea
                  name="returnNotes"
                  rows="2"
                  placeholder="Notes on garment condition, stain details, dry cleaning instructions..."
                  style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #ccc", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <s-button type="submit">Mark Returned & Process Refund</s-button>
                <button
                  type="button"
                  onClick={closeInspection}
                  style={{ padding: "10px 16px", borderRadius: "6px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>

            </Form>
          </s-box>
        </s-section>
      )}

      {/* Active Return Queue Table */}
      <s-section heading={`Active Outfits Outstanding (${returnQueue.length})`}>
        {returnQueue.length === 0 ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No active or picked-up outfits waiting for return.</s-paragraph>
          </s-box>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", backgroundColor: "#f9f9f9" }}>
                  <th style={{ padding: "10px" }}>Booking ID</th>
                  <th style={{ padding: "10px" }}>Customer</th>
                  <th style={{ padding: "10px" }}>Outfit / Product</th>
                  <th style={{ padding: "10px" }}>Pickup Date</th>
                  <th style={{ padding: "10px" }}>Expected Return</th>
                  <th style={{ padding: "10px" }}>Deposit Held</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {returnQueue.map((r) => {
                  const returnDateObj = new Date(r.returnDate);
                  const isPastDue = returnDateObj < new Date();

                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee", backgroundColor: isPastDue ? "#fff5f5" : "inherit" }}>
                      <td style={{ padding: "10px", fontWeight: "600" }}>
                        <Link to={`/app/rentals/${r.id}`} style={{ color: "#005bd3", textDecoration: "none" }}>
                          {r.bookingId || r.id.slice(-8)}
                        </Link>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ fontWeight: "600" }}>{r.customerName}</div>
                        <div style={{ fontSize: "12px", color: "#666" }}>{r.customerPhone}</div>
                      </td>
                      <td style={{ padding: "10px" }}>{r.productTitle}</td>
                      <td style={{ padding: "10px" }}>{new Date(r.pickupDate).toLocaleDateString("en-IN")}</td>
                      <td style={{ padding: "10px", fontWeight: "600", color: isPastDue ? "#b00020" : "#111" }}>
                        🔄 {returnDateObj.toLocaleDateString("en-IN")}
                        {isPastDue && <span style={{ display: "block", fontSize: "11px", color: "#b00020" }}>Overdue!</span>}
                      </td>
                      <td style={{ padding: "10px", fontWeight: "600" }}>₹{r.securityDeposit || 0}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ padding: "4px 8px", borderRadius: "4px", backgroundColor: "#e0f2fe", color: "#0369a1", fontSize: "12px", fontWeight: "600" }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <button
                          type="button"
                          onClick={() => openInspection(r)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "0",
                            background: "#16803c",
                            color: "#fff",
                            fontWeight: "600",
                            fontSize: "12px",
                            cursor: "pointer"
                          }}
                        >
                          Process Return & Refund
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
