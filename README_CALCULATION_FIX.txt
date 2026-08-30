Calculation fix patch for koenen-property-management

Replace these files in the project:
- src/state/AppDataContext.tsx
- src/pages/Mietuebersicht.tsx
- src/pages/Portfolio.tsx
- src/pages/portfolio/Portfolio.tsx

Changes:
- Rent income now uses booking entries with category Miete/Kaltmiete/Warmmiete/Pacht and income type.
- Rent overview now calculates the full current month by booking date.
- Portfolio rows resolve both core property_id and portfolio_property_id so Buchungen are matched to the correct object.
- Portfolio Nebenkosten uses Betriebskosten/Nebenkosten from Portfolio data as yearly reference, with Buchungen fallback.
