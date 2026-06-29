# Opptra Discount Engine

FDE Intern assignment — customer-facing cart pricing with item-level discounts, cart-level offers, natural-language rule input, and PDF cart upload.

## Live demo

**https://YOUR_DEPLOYMENT_URL.vercel.app** ← replace after deploying to Vercel/Netlify

## Run locally (3 steps)

```bash
npm install
cp .env.example .env   # optional: add VITE_ANTHROPIC_API_KEY for LLM rule parsing
npm run dev
```

Open http://localhost:5173

## How to use

1. Click **Load sample data** (or upload `sample-data/rules.csv` + `sample-data/cart.csv`)
2. Click **Calculate Discounts**
3. Optional: add a rule in plain English, or upload a cart PDF

### Natural language rules (optional API key)

Copy `.env.example` to `.env` and set `VITE_ANTHROPIC_API_KEY`. Without a key, the built-in local parser handles the assignment’s PDF example phrases. Restart the dev server after changing `.env`.

## Features implemented

| Task | Description |
|------|-------------|
| Base engine | Item-level discounts — max non-stackable saving, stackable rules on top |
| Cart-level offer | RULE-04: 10% off entire cart when subtotal ≥ Rs.4,000 |
| NL rule input | Plain-English → parsed rule → confirm/discard → recalculate |
| PDF cart upload | Extract Product / Brand / Platform / Base Price table → replace cart |

## Expected results (sample data)

| Item | Base | Final | Status |
|------|------|-------|--------|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Max discount |
| ITEM-02 | Rs.849 | Rs.629 | Stacked |
| ITEM-03 | Rs.599 | Rs.509 | Discount applied |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offer |
| ITEM-05 | Rs.449 | Rs.382 | Discount applied |
| ITEM-06 | Rs.899 | Rs.809 | Discount applied |

- **Cart total before offer:** Rs.5,932  
- **Cart offer (RULE-04):** −Rs.593  
- **Final cart total:** Rs.5,339  

## Project structure

```
src/
  engine/
    discountEngine.js   ← pure discount logic + applyCartOffer()
    csvParser.js        ← CSV → DiscountRule / CartItem
    nlRuleParser.js     ← plain-English → DiscountRule (LLM + local fallback)
    pdfCartParser.js    ← PDF → CartItem[]
  components/
    CsvUploader.jsx
    PdfUploader.jsx
    NlRuleInput.jsx
    DataTable.jsx
    ErrorBanner.jsx
  App.jsx
  main.jsx

sample-data/
  rules.csv             ← 4 rules including RULE-04 (cart)
  cart.csv              ← 6 items
```

## Deploy

```bash
npm run build
```

Deploy the `dist/` folder to [Vercel](https://vercel.com) or Netlify. Add `VITE_ANTHROPIC_API_KEY` in the host’s environment variables if using LLM parsing in production.

## Design tradeoffs

1. **Inputs adapt to the engine** — CSV, PDF, and NL parsers all output the same `DiscountRule` / `CartItem` shapes; `processCart` and `applyDiscounts` are unchanged.

2. **Cart offer after items** — `applyCartOffer()` runs on item results only; cart-scope rules never match individual items in `ruleMatchesItem`.

3. **LLM + local fallback** — Anthropic API when a key is set; otherwise a regex parser covers the brief’s test phrases. Ambiguous input (e.g. bare `10%`, “discount for big orders”) returns the PDF’s unresolvable message, not a guessed rule.

4. **PDF parsing** — Client-side `pdfjs-dist`; text is split on `Rs.X,XXX` price anchors because pdf.js flattens tables. Malformed rows are skipped with row-level errors; partial success is allowed.

5. **Multiple cart rules** — If several cart rules qualify, the one with the largest rupee saving wins (same tie-break as item-level).

## CSV formats

**rules.csv** — columns: `rule_id`, `scope` (`brand` \| `platform` \| `cart`), `applies_to`, `type`, `value`, `stackable`, `min_cart_value` (required for `cart` scope)

**cart.csv** — columns: `item_id`, `product`, `brand`, `platform`, `base_price`
