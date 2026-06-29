/**
 * App.jsx
 *
 * Top-level component. Manages state for rules, cart items, and results.
 * Wires together CSV upload → parse → engine → display.
 */

import { useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import NlRuleInput from './components/NlRuleInput.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { parsePdfCart } from './engine/pdfCartParser.js'
import { processCart, applyCartOffer } from './engine/discountEngine.js'
import rulesSampleCsv from '../sample-data/rules.csv?raw'
import cartSampleCsv from '../sample-data/cart.csv?raw'

// ── Column definitions ───────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId',    label: 'Rule ID' },
  { key: 'scope',     label: 'Scope',      render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  { key: 'appliesTo', label: 'Applies To', render: (v) => v || '—' },
  { key: 'type',      label: 'Type',       render: (v) => v.charAt(0).toUpperCase() + v.slice(1) },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`,
  },
  { key: 'stackable', label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
  {
    key: 'minCartValue',
    label: 'Min Cart',
    render: (v) => (v != null ? `Rs.${v.toLocaleString('en-IN')}` : '—'),
  },
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  {
    key: 'reasoning',
    label: 'Rule(s) Applied',
    render: (v) => (
      <span style={{ color: v === 'No offers available' ? '#888' : '#131A48', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
        {v === 'No offers available' ? 'No rules match' : v}
      </span>
    ),
  },
  { key: 'finalPrice',label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (_, row) => {
      const status = deriveItemStatus(row)
      const color = status === 'No offer' ? '#888' : status === 'Max discount' || status === 'Stacked' ? '#1e5c2c' : '#131A48'
      return <span style={{ color, fontWeight: status !== 'No offer' ? 600 : 400 }}>{status}</span>
    },
  },
]

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  btnDisabled: {
    background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  totalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  subtotalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem',
  },
  offerRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.35rem',
  },
  totalLabel: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 16, color: '#131A48' },
  offerLabel: { fontSize: 13, color: '#1e5c2c', fontWeight: 600 },
  offerValue: { fontSize: 14, color: '#1e5c2c', fontWeight: 700 },
  subtotalLabel: { fontSize: 13, color: '#666' },
  subtotalValue: { fontSize: 14, color: '#666' },
  sampleBtn: {
    marginTop: 8,
    background: 'none',
    border: '1px solid #CECECE',
    borderRadius: 4,
    padding: '0.35rem 0.65rem',
    fontSize: 11,
    fontWeight: 600,
    color: '#131A48',
    cursor: 'pointer',
  },
  warnBanner: {
    marginTop: 8,
    padding: '0.5rem 0.75rem',
    background: '#fff8e6',
    border: '1px solid #e6c200',
    borderLeft: '3px solid #e6c200',
    borderRadius: 4,
    fontSize: 11,
    color: '#5a4a00',
  },
}

function deriveItemStatus(row) {
  if (row.reasoning === 'No offers available') return 'No offer'
  if (row.appliedRules.length > 1) return 'Stacked'
  if (row.skippedRules.length > 0) return 'Max discount'
  if (row.totalDiscount > 0) return 'Discount applied'
  return '—'
}

function cartOfferDescription(rule, subtotal, discountAmount) {
  const threshold = `Rs.${rule.minCartValue.toLocaleString('en-IN')}`
  const sub = `Rs.${subtotal.toLocaleString('en-IN')}`
  const off = rule.type === 'percentage'
    ? `${rule.value}% off entire cart`
    : `Rs.${rule.value} off entire cart`
  return `Cart Offer — ${rule.ruleId}: ${sub} ≥ ${threshold} → ${off} → −Rs.${discountAmount.toLocaleString('en-IN')}`
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName]   = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)

  const [results, setResults]       = useState(null)

  // ── Handlers ──

  function applyNewCart(data, errors, fileName) {
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setResults(null)
  }

  function recalculate(cart, activeRules) {
    if (cart.length > 0 && activeRules.length > 0) {
      setResults(processCart(cart, activeRules))
    } else {
      setResults(null)
    }
  }

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setResults(null)
    return { data, errors }
  }

  function loadSampleRules() {
    handleRulesLoad(rulesSampleCsv, 'sample-data/rules.csv')
  }

  function loadSampleCart() {
    const { data, errors } = parseCartCSV(cartSampleCsv)
    applyNewCart(data, errors, 'sample-data/cart.csv')
    if (rules.length > 0 && data.length > 0) {
      setResults(processCart(data, rules))
    }
  }

  function loadAllSampleData() {
    const { data: rulesData } = handleRulesLoad(rulesSampleCsv, 'sample-data/rules.csv')
    const { data: cartData } = parseCartCSV(cartSampleCsv)
    applyNewCart(cartData, [], 'sample-data/cart.csv')
    if (rulesData.length > 0 && cartData.length > 0) {
      setResults(processCart(cartData, rulesData))
    }
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    applyNewCart(data, errors, fileName)
  }

  async function handlePdfCartLoad(file) {
    setPdfLoading(true)
    const { data, errors } = await parsePdfCart(file)
    setPdfLoading(false)
    applyNewCart(data, errors, file.name)
    if (data.length > 0 && rules.length > 0) {
      setResults(processCart(data, rules))
    }
  }

  function handleRuleConfirm(newRule) {
    const updatedRules = [...rules, newRule]
    setRules(updatedRules)
    recalculate(cartItems, updatedRules)
  }

  function handleCalculate() {
    recalculate(cartItems, rules)
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0
  const cartOffer = results ? applyCartOffer(results, rules) : null
  const missingCartRule = rules.length > 0 && !rules.some((r) => r.scope === 'cart')

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>

        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <button type="button" style={S.sampleBtn} onClick={loadAllSampleData}>
            Load sample data (4 rules + 6 items — per assignment brief)
          </button>
        </div>

        {/* Upload row */}
        <div style={S.grid2}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <button type="button" style={S.sampleBtn} onClick={loadSampleRules}>
              Load sample rules.csv (includes RULE-04 cart offer)
            </button>
            {missingCartRule && (
              <div style={S.warnBanner}>
                Only {rules.length} rule{rules.length > 1 ? 's' : ''} loaded — RULE-04 (cart-level 10% off when cart ≥ Rs.4,000) is missing.
                Use the sample file above to match the assignment brief.
              </div>
            )}
            <ErrorBanner errors={rulesErrors} />
            <NlRuleInput onConfirm={handleRuleConfirm} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0}
              fileName={cartFileName}
            />
            <button type="button" style={S.sampleBtn} onClick={loadSampleCart}>
              Load sample cart.csv (6 items)
            </button>
            <PdfUploader
              label="cart.pdf"
              description="Or upload a cart PDF"
              onLoad={handlePdfCartLoad}
              hasData={cartItems.length > 0 && cartFileName.endsWith('.pdf')}
              fileName={cartFileName.endsWith('.pdf') ? cartFileName : ''}
              loading={pdfLoading}
            />
            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Upload both files to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results} />
            {cartOffer?.applied && (
              <div style={S.subtotalRow}>
                <span style={S.subtotalLabel}>Cart Total before offer</span>
                <span style={S.subtotalValue}>Rs.{cartOffer.subtotal.toLocaleString('en-IN')}</span>
              </div>
            )}
            {cartOffer?.applied && (
              <div style={S.offerRow}>
                <span style={S.offerLabel}>
                  {cartOfferDescription(cartOffer.rule, cartOffer.subtotal, cartOffer.discountAmount)}
                </span>
                <span style={S.offerValue}>−Rs.{cartOffer.discountAmount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div style={S.totalRow}>
              <span style={S.totalLabel}>{cartOffer?.applied ? 'Final Cart Total' : 'Cart Total'}</span>
              <span style={S.totalValue}>
                Rs.{(cartOffer?.applied ? cartOffer.finalTotal : cartOffer?.subtotal ?? 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
