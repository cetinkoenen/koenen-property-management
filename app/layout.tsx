// app/layout.tsx
import "./globals.css";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Koenen Property Management – Admin",
  description: "Admin Dashboard Koenen Property Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          background: "#ffffff",
          color: "#111827",
        }}
      >
        {/* ================= HEADER ================= */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "white",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            {/* LOGO */}
            <Image
              src="/logo/koenen.png"
              alt="Koenen Property Management"
              width={180}
              height={72}
              style={{ width: 180, height: "auto", objectFit: "contain" }}
              priority
            />

            {/* TITLE */}
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                Koenen Property Management
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                Admin Dashboard
              </div>
            </div>
          </div>
        </header>

        {/* ================= CONTENT ================= */}
        <main style={{ padding: 16 }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {children}
          </div>
        </main>

        {/* ================= FOOTER ================= */}
        <footer
          style={{
            marginTop: 32,
            padding: "14px 16px",
            borderTop: "1px solid #e5e7eb",
            background: "white",
            fontSize: 12,
            opacity: 0.6,
            textAlign: "center",
          }}
        >
          © {new Date().getFullYear()} Koenen Property Management
        </footer>
      </body>
    </html>
  );
}
