import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const featureCategories = [
  {
    id: "availability-inventory",
    tag: "Category 1",
    title: "Availability & Inventory",
    features: [
      {
        icon: "⚡",
        title: "Smart Inventory Availability",
        desc: "Real-time product availability based on bookings, blocks, and operational schedules.",
        status: "Active",
      },
      {
        icon: "🔍",
        title: "Product Availability Inspector",
        desc: "Search products by name, SKU, or product information and inspect their upcoming availability.",
        status: "Active",
      },
      {
        icon: "🔎",
        title: "Availability Search",
        desc: "Search inventory availability between selected dates and identify available and unavailable products.",
        status: "Active",
      },
      {
        icon: "📦",
        title: "Product-Level Availability",
        desc: "Manage availability independently for individual products and inventory items.",
        status: "Active",
      },
      {
        icon: "🏷️",
        title: "Product Search & Filtering",
        desc: "Allow administrators to quickly locate products and inspect their availability.",
        status: "Active",
      },
      {
        icon: "🔴",
        title: "Damaged / Lost Inventory",
        desc: "Mark inventory as damaged or lost so it cannot be accidentally rented.",
        status: "Active",
      },
    ],
  },
  {
    id: "bookings-rentals",
    tag: "Category 2",
    title: "Bookings & Rentals",
    features: [
      {
        icon: "📋",
        title: "Rental Booking Management",
        desc: "Manage rental bookings and prevent conflicting reservations.",
        status: "Active",
      },
      {
        icon: "🛡️",
        title: "Double-Booking Prevention",
        desc: "Automatically detect overlapping bookings and prevent unavailable inventory from being booked.",
        status: "Active",
      },
      {
        icon: "🏬",
        title: "Offline / In-Store Bookings",
        desc: "Record bookings made outside the online storefront while keeping inventory availability synchronized.",
        status: "Active",
      },
      {
        icon: "🔒",
        title: "Booking Validation Before Submission",
        desc: "Perform a final availability check before creating a customer booking to reduce race-condition and double-booking problems.",
        status: "Active",
      },
      {
        icon: "⚙️",
        title: "Availability-Based Booking Workflow",
        desc: "Use the centralized availability engine for booking validation instead of relying on separate availability logic.",
        status: "Active",
      },
      {
        icon: "📜",
        title: "Booking History",
        desc: "View historical booking information associated with inventory.",
        status: "Active",
      },
    ],
  },
  {
    id: "scheduling-buffers",
    tag: "Category 3",
    title: "Scheduling & Buffers",
    features: [
      {
        icon: "📅",
        title: "Availability Calendar",
        desc: "View product availability across dates through a centralized calendar.",
        status: "Active",
      },
      {
        icon: "🧼",
        title: "Cleaning Buffer",
        desc: "Automatically reserve inventory after a rental for cleaning before it becomes available again.",
        status: "Active",
      },
      {
        icon: "🔄",
        title: "Return Buffer",
        desc: "Support return dates and post-return availability scheduling.",
        status: "Active",
      },
      {
        icon: "✂️",
        title: "Alteration Buffer",
        desc: "Reserve products for alteration or preparation before their next rental.",
        status: "Active",
      },
      {
        icon: "⚙️",
        title: "Configurable Operational Buffers",
        desc: "Configure cleaning, return and preparation buffers according to business requirements.",
        status: "Active",
      },
      {
        icon: "⏱️",
        title: "Return Date Management",
        desc: "Track expected return dates separately from rental/usage dates.",
        status: "Active",
      },
      {
        icon: "🚚",
        title: "Delivery Date Management",
        desc: "Support delivery scheduling before the actual rental/event date.",
        status: "Planned / Not Yet Implemented",
      },
    ],
  },
  {
    id: "blocking-operations",
    tag: "Category 4",
    title: "Blocking & Operations",
    features: [
      {
        icon: "🔒",
        title: "Manual Date Blocking",
        desc: "Block specific products for selected dates whenever inventory cannot be rented.",
        status: "Active",
      },
      {
        icon: "📦",
        title: "Bulk Date Blocking",
        desc: "Select multiple products and block them for a common date range.",
        status: "Active",
      },
      {
        icon: "⚫",
        title: "Maintenance Management",
        desc: "Block inventory when products require maintenance or servicing.",
        status: "Active",
      },
      {
        icon: "🟡",
        title: "Customer Hold",
        desc: "Temporarily reserve inventory using internal customer holds.",
        status: "Active",
      },
      {
        icon: "🚦",
        title: "Operational Status Management",
        desc: "Support statuses including Available, Customer Booking, Offline Booking, Cleaning, Alteration, Maintenance, Hold, and Damaged/Lost.",
        status: "Active",
      },
      {
        icon: "⚠️",
        title: "Conflict Detection",
        desc: "Detect conflicts between bookings, blocks and other inventory restrictions.",
        status: "Active",
      },
    ],
  },
  {
    id: "admin-analytics",
    tag: "Category 5",
    title: "Admin & Analytics",
    features: [
      {
        icon: "🧠",
        title: "Centralized Availability Engine",
        desc: "All booking, blocking, buffer and availability calculations must use the same central availability engine to prevent inconsistencies.",
        status: "Active",
      },
      {
        icon: "📈",
        title: "Unified Availability Timeline",
        desc: "View the complete lifecycle of inventory: Booking → Return → Cleaning → Available → Offline Booking → Alteration → Available.",
        status: "Active",
      },
      {
        icon: "👁️",
        title: "Admin Availability Details",
        desc: "Administrators can view detailed internal availability information and reasons.",
        status: "Active",
      },
      {
        icon: "📊",
        title: "Admin Calendar Status Visualization",
        desc: "Use clear visual status indicators for different internal inventory states.",
        status: "Active",
      },
      {
        icon: "🖥️",
        title: "Inventory Availability Dashboard",
        desc: "Provide administrators with an overview of current and upcoming inventory availability.",
        status: "Active",
      },
      {
        icon: "🛡️",
        title: "Audit Log",
        desc: "Track administrative actions including who created, edited, blocked or unblocked inventory and when.",
        status: "Active",
      },
      {
        icon: "🕒",
        title: "Availability History",
        desc: "Track historical availability changes and inventory blocking activity.",
        status: "Active",
      },
      {
        icon: "📝",
        title: "Internal Notes",
        desc: "Store internal operational notes without exposing them to customers.",
        status: "Active",
      },
    ],
  },
  {
    id: "customer-security",
    tag: "Category 6",
    title: "Customer Experience & Security",
    features: [
      {
        icon: "🟢",
        title: "Customer-Facing Availability",
        desc: "Show customers only whether a product/date is Available or Unavailable.",
        status: "Active",
      },
      {
        icon: "🔐",
        title: "Customer Data Protection",
        desc: "Never expose internal booking reasons, block reasons, notes, staff information, customer information or internal metadata through customer-facing availability responses.",
        status: "Active",
      },
    ],
  },
];

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.landingContainer}>
      {/* Top Navbar */}
      <nav className={styles.topNav}>
        <div className={styles.brandLogo}>
          <div className={styles.brandIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 16V8L12 13L17 8V16" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span>Growth Manch</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            href="#about-us"
            style={{
              fontSize: "13px",
              fontWeight: "600",
              color: "#646B7C",
              textDecoration: "none",
              padding: "6px 12px",
              borderRadius: "8px",
              transition: "color 0.2s ease",
            }}
          >
            About Us
          </a>

          <a
            href="https://www.growthmanch.in"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navBadge}
            style={{ textDecoration: "none" }}
          >
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#7964FF" }} />
            <span>www.growthmanch.in ↗</span>
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <div className={styles.heroPillBadge}>
          <span className={styles.heroPillDot} />
          <span>Built for Rental & Inventory Operations</span>
        </div>

        <h1 className={styles.heroHeading}>Simplify. Automate. Grow.</h1>

        <p className={styles.heroTagline}>
          Professional Shopify solutions built by Growth Manch to make complex business operations simpler, smarter, and more efficient.
        </p>

        {/* Store Connection Card */}
        <div className={styles.connectCard}>
          <h2 className={styles.connectHeading}>Connect Your Shopify Store</h2>
          <p className={styles.connectHelper}>
            <span>🔒</span>
            <span>Securely connect your Shopify store to get started.</span>
          </p>

          {showForm && (
            <Form className={styles.connectForm} method="post" action="/auth/login">
              <div className={styles.inputGroup}>
                <input
                  className={styles.shopInput}
                  type="text"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  required
                />
                <button className={styles.connectBtn} type="submit">
                  Connect Store
                </button>
              </div>
            </Form>
          )}
        </div>
      </section>

      {/* Feature Showcase Section */}
      <section className={styles.featuresSection}>
        <div className={styles.featuresHeader}>
          <h2 className={styles.featuresHeading}>
            Everything You Need to Manage Rental Inventory
          </h2>
          <p className={styles.featuresSubtitle}>
            Powerful tools designed to manage availability, bookings, inventory, scheduling and rental operations from one place.
          </p>
        </div>

        {featureCategories.map((cat) => (
          <div key={cat.id} className={styles.categoryBlock}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryPill}>{cat.tag}</span>
              <h3 className={styles.categoryTitle}>{cat.title}</h3>
            </div>

            <div className={styles.featureGrid}>
              {cat.features.map((feat, idx) => (
                <div key={idx} className={styles.featureCard}>
                  <div className={styles.featureCardTop}>
                    <div className={styles.featureIconWrap}>{feat.icon}</div>
                    <span
                      className={`${styles.featureStatusBadge} ${
                        feat.status.includes("Planned") ? styles.statusPlanned : styles.statusActive
                      }`}
                    >
                      {feat.status}
                    </span>
                  </div>
                  <h4 className={styles.featureTitle}>{feat.title}</h4>
                  <p className={styles.featureDesc}>{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* About Us Section */}
      <section className={styles.aboutSection} id="about-us">
        <div className={styles.aboutCard}>
          <div className={styles.aboutHeader}>
            <div>
              <div className={styles.aboutBadge}>
                <span>🏢</span>
                <span>About Us</span>
              </div>
              <h2 className={styles.aboutTitle}>Built by Growth Manch</h2>
              <p className={styles.aboutTagline}>
                Growth Manch is a premier digital engineering and performance growth agency. We architect high-ROI performance marketing engines, intelligent workflow automations, and custom enterprise-grade web solutions for high-growth businesses.
              </p>
            </div>
          </div>

          <div className={styles.aboutGrid}>
            <div className={styles.aboutTile}>
              <h4 className={styles.aboutTileTitle}>
                <span>⚡</span>
                <span>Custom Web Engineering</span>
              </h4>
              <p className={styles.aboutTileDesc}>
                Precision full-stack web applications and robust Shopify platform integrations built for scale, reliability, and security.
              </p>
            </div>

            <div className={styles.aboutTile}>
              <h4 className={styles.aboutTileTitle}>
                <span>🤖</span>
                <span>AI & Workflow Automation</span>
              </h4>
              <p className={styles.aboutTileDesc}>
                Eliminating manual bottlenecks with smart inventory engines, automated operational buffers, and streamlined operations.
              </p>
            </div>

            <div className={styles.aboutTile}>
              <h4 className={styles.aboutTileTitle}>
                <span>📈</span>
                <span>Performance Growth</span>
              </h4>
              <p className={styles.aboutTileDesc}>
                Data-backed digital marketing, organic SEO, and conversion optimization to help modern brands scale 10x efficiently.
              </p>
            </div>
          </div>

          <div className={styles.aboutCtaBar}>
            <div>
              <span style={{ fontSize: "13px", color: "#646B7C", display: "block", marginBottom: "2px" }}>
                Official Website:
              </span>
              <a
                href="https://www.growthmanch.in"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "16px",
                  fontWeight: "700",
                  color: "#7964FF",
                  textDecoration: "none",
                }}
              >
                www.growthmanch.in ↗
              </a>
            </div>

            <a
              href="https://www.growthmanch.in"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.websiteLinkBtn}
            >
              <span>Visit www.growthmanch.in</span>
              <span>➔</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.landingFooter}>
        <div className={styles.footerBrand}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="6" fill="#7964FF"/>
            <path d="M7 16V8L12 13L17 8V16" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Developed by <a href="https://www.growthmanch.in" target="_blank" rel="noopener noreferrer" style={{ color: "#7964FF", fontWeight: "700", textDecoration: "none" }}>Growth Manch</a></span>
        </div>
        <div>
          Professional Shopify solutions engineered for high performance, reliability, and precision rental operations. Visit <a href="https://www.growthmanch.in" target="_blank" rel="noopener noreferrer" style={{ color: "#7964FF", fontWeight: "600", textDecoration: "none" }}>www.growthmanch.in</a>
        </div>
      </footer>
    </div>
  );
}

