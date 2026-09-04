import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const { id } = params;

  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      customer: true,
      payments: true,
    },
  });

  if (!rental || rental.shop !== session.shop) {
    throw new Response("Receipt Not Found", { status: 404 });
  }

  const settings = await prisma.rentalSettings.findUnique({
    where: { shop: session.shop },
  });

  const damageFee = rental.damageFee || 0;
  const lateFee = rental.lateFee || 0;
  const depositDeduction = rental.depositDeduction || 0;
  const totalDeductions = damageFee + lateFee + depositDeduction;

  const securityDeposit = rental.securityDeposit || 0;
  const refundableDeposit = rental.refundableDeposit !== null && rental.refundableDeposit !== undefined 
    ? rental.refundableDeposit 
    : Math.max(0, securityDeposit - totalDeductions);

  return {
    rental,
    settings,
    damageFee,
    lateFee,
    depositDeduction,
    totalDeductions,
    refundableDeposit,
  };
};

export default function ReturnReceipt() {
  const { rental, settings, damageFee, lateFee, depositDeduction, totalDeductions, refundableDeposit } = useLoaderData();
  const bName = settings?.businessName || "NS Bridal & Groom Collection";

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "40px", maxWidth: "800px", margin: "0 auto", color: "#222" }}>
      
      {/* Print Button Header */}
      <div style={{ textAlign: "right", marginBottom: "20px" }} className="no-print">
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "10px 20px",
            backgroundColor: "#16803c",
            color: "#fff",
            border: "0",
            borderRadius: "6px",
            fontWeight: "700",
            fontSize: "14px",
            cursor: "pointer"
          }}
        >
          🖨️ Print Return & Refund Receipt
        </button>
      </div>

      {/* Header Branding */}
      <div style={{ borderBottom: "3px solid #111", paddingBottom: "16px", marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "28px", letterSpacing: "1px", textTransform: "uppercase" }}>
          {bName}
        </h1>
        <p style={{ margin: "0", fontSize: "14px", color: "#555" }}>
          {settings?.address || "Premium Bridal & Groom Rental Outfits | Return & Deposit Settlement"} {settings?.phone ? `| Tel: ${settings.phone}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", justify: "space-between", marginBottom: "24px" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px" }}>RETURN & DEPOSIT REFUND RECEIPT</h2>
          <div style={{ fontSize: "14px", color: "#555" }}>
            Return Date: {rental.actualReturnDate ? new Date(rental.actualReturnDate).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN")}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "#16803c" }}>
            Booking ID: {rental.bookingId || rental.id.slice(-8)}
          </div>
          <div style={{ fontSize: "13px", color: "#666" }}>
            Status: {rental.status}
          </div>
        </div>
      </div>

      {/* Customer & Outfit Return Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
        
        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", backgroundColor: "#fafafa" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
            Customer Details
          </h3>
          <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
            <div><strong>Name:</strong> {rental.customerName}</div>
            <div><strong>Phone:</strong> {rental.customerPhone}</div>
            {rental.customerEmail && <div><strong>Email:</strong> {rental.customerEmail}</div>}
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "16px", backgroundColor: "#fafafa" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: "16px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
            Garment Inspection
          </h3>
          <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
            <div><strong>Outfit Name:</strong> {rental.productTitle}</div>
            <div><strong>Expected Return:</strong> {new Date(rental.returnDate).toLocaleDateString("en-IN")}</div>
            <div>
              <strong>Garment Condition:</strong>{" "}
              <span style={{ fontWeight: "700", color: rental.productCondition === "GOOD" ? "#16803c" : "#b00020" }}>
                {rental.productCondition || "GOOD"}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Itemized Deposit Refund Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px", fontSize: "14px" }}>
        <thead>
          <tr style={{ backgroundColor: "#222", color: "#fff" }}>
            <th style={{ padding: "12px", textAlign: "left" }}>Deposit Settlement Item</th>
            <th style={{ padding: "12px", textAlign: "right" }}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "10px" }}>Original Security Deposit Paid</td>
            <td style={{ padding: "10px", textAlign: "right", fontWeight: "700" }}>₹{rental.securityDeposit || 0}</td>
          </tr>

          {damageFee > 0 && (
            <tr style={{ borderBottom: "1px solid #eee", color: "#b00020" }}>
              <td style={{ padding: "10px" }}>Garment Damage / Cleaning Fee Deduction</td>
              <td style={{ padding: "10px", textAlign: "right" }}>-₹{damageFee}</td>
            </tr>
          )}

          {lateFee > 0 && (
            <tr style={{ borderBottom: "1px solid #eee", color: "#b00020" }}>
              <td style={{ padding: "10px" }}>Late Return Fee Deduction</td>
              <td style={{ padding: "10px", textAlign: "right" }}>-₹{lateFee}</td>
            </tr>
          )}

          {depositDeduction > 0 && (
            <tr style={{ borderBottom: "1px solid #eee", color: "#b00020" }}>
              <td style={{ padding: "10px" }}>Other Deposit Deductions</td>
              <td style={{ padding: "10px", textAlign: "right" }}>-₹{depositDeduction}</td>
            </tr>
          )}

          <tr style={{ borderBottom: "2px solid #222", backgroundColor: "#f0faf4" }}>
            <td style={{ padding: "14px", fontWeight: "800", fontSize: "16px", color: "#16803c" }}>
              Final Security Deposit Refunded to Customer
            </td>
            <td style={{ padding: "14px", textAlign: "right", fontWeight: "800", fontSize: "18px", color: "#16803c" }}>
              ₹{refundableDeposit}
            </td>
          </tr>
        </tbody>
      </table>

      {rental.returnNotes && (
        <div style={{ border: "1px solid #ddd", borderRadius: "8px", padding: "14px", marginBottom: "24px", backgroundColor: "#fafafa" }}>
          <strong>Inspection Remarks:</strong> {rental.returnNotes}
        </div>
      )}

      {/* Terms & Signatures */}
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "32px" }}>
        I confirm that the garment has been returned, inspected, and the security deposit settlement of ₹{refundableDeposit} has been received.
      </div>

      <div style={{ display: "flex", justify: "space-between", marginTop: "40px", paddingTop: "20px", borderTop: "1px dashed #aaa" }}>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ minHeight: "40px" }} />
          <div style={{ borderTop: "1px solid #222", fontSize: "14px", fontWeight: "600", paddingTop: "4px" }}>
            Customer Signature
          </div>
        </div>

        <div style={{ textAlign: "center", width: "220px" }}>
          <div style={{ minHeight: "40px" }} />
          <div style={{ borderTop: "1px solid #222", fontSize: "14px", fontWeight: "600", paddingTop: "4px" }}>
            {bName}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
        }
      `}</style>

    </div>
  );
}
