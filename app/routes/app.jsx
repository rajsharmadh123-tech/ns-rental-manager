import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <style>{`
        :root {
          --gm-purple: #7964FF;
          --gm-purple-hover: #634EFF;
          --gm-purple-light: #F0EEFF;
          --gm-navy: #2E3346;
          --gm-text-muted: #646B7C;
          --gm-bg: #F8F9FC;
          --gm-border: #E2E4EB;
        }

        body {
          background-color: #F8F9FC;
          color: #2E3346;
        }

        a {
          color: #7964FF;
        }

        .gm-btn-primary {
          background-color: #7964FF !important;
          color: #FFFFFF !important;
          border-radius: 8px !important;
          padding: 10px 18px !important;
          font-weight: 600 !important;
          border: none !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          text-decoration: none !important;
          cursor: pointer !important;
          transition: background-color 0.2s ease !important;
        }
        .gm-btn-primary:hover {
          background-color: #634EFF !important;
        }

        .gm-badge-purple {
          background-color: #F0EEFF !important;
          color: #7964FF !important;
          border: 1px solid #D8D2FF !important;
          padding: 3px 8px !important;
          border-radius: 6px !important;
          font-weight: 700 !important;
          font-size: 12px !important;
        }

        .gm-header-title {
          color: #2E3346 !important;
          font-weight: 700 !important;
        }
      `}</style>

      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/rentals">Rentals</s-link>
        <s-link href="/app/calendar">Calendar</s-link>
        <s-link href="/app/customers">Customers</s-link>
        <s-link href="/app/pickups">Pickups</s-link>
        <s-link href="/app/returns">Returns</s-link>
        <s-link href="/app/overdue">Overdue</s-link>
        <s-link href="/app/payments">Payments</s-link>
        <s-link href="/app/reports">Reports</s-link>
        <s-link href="/app/products">Rental Products</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>

        <footer style={{
          textAlign: "center",
          padding: "20px 16px 28px",
          color: "#646B7C",
          fontSize: "13px",
          borderTop: "1px solid #E2E4EB",
          marginTop: "40px",
          backgroundColor: "#FFFFFF"
        }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="6" fill="#7964FF"/>
              <path d="M7 16V8L12 13L17 8V16" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Developed by <strong style={{ color: "#2E3346", fontWeight: "700" }}>Growth Manch</strong></span>
          </div>
        </footer>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
