/**
 * NlRuleInput.jsx
 *
 * Plain-English discount rule input with LLM parse + confirmation step.
 * Examples and behaviour match the assignment PDF brief.
 */

import { useState } from 'react'
import { parseRuleFromText } from '../engine/nlRuleParser.js'
import ErrorBanner from './ErrorBanner.jsx'

const PDF_EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
]

function formatRuleSummary(rule) {
  const parts = [
    `Scope: ${rule.scope.charAt(0).toUpperCase() + rule.scope.slice(1)}`,
  ]
  if (rule.scope !== 'cart' && rule.appliesTo) {
    parts.push(`Applies to: ${rule.appliesTo}`)
  }
  parts.push(`Type: ${rule.type.charAt(0).toUpperCase() + rule.type.slice(1)}`)
  parts.push(
    `Value: ${rule.type === 'percentage' ? `${rule.value}%` : `Rs.${rule.value}`}`
  )
  parts.push(`Stackable: ${rule.stackable ? 'Yes' : 'No'}`)
  if (rule.minCartValue != null) {
    parts.push(`Min cart value: Rs.${rule.minCartValue.toLocaleString('en-IN')}`)
  }
  return parts.join(' · ')
}

export default function NlRuleInput({ onConfirm }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingRule, setPendingRule] = useState(null)
  const [errors, setErrors] = useState([])

  async function handleParse() {
    setLoading(true)
    setErrors([])
    setPendingRule(null)

    const result = await parseRuleFromText(text)
    setLoading(false)

    if (result.success) {
      setPendingRule(result.rule)
    } else {
      setErrors([result.reason])
    }
  }

  function handleConfirm() {
    if (!pendingRule) return
    onConfirm({
      ...pendingRule,
      ruleId: `RULE-CUSTOM-${Date.now()}`,
    })
    setText('')
    setPendingRule(null)
    setErrors([])
  }

  function handleDiscard() {
    setPendingRule(null)
  }

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #eee' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#131A48', marginBottom: 4 }}>
        Add rule in plain English
      </div>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, lineHeight: 1.45 }}>
        Describe the full rule (scope, value, and condition). A bare &quot;10%&quot; is too vague —
        the brief requires a complete phrase like the examples below.
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="20% off for Natura Casa brand, stackable with other offers"
          style={{
            flex: 1,
            padding: '0.5rem 0.65rem',
            fontSize: 12,
            border: '1px solid #CECECE',
            borderRadius: 4,
          }}
          onKeyDown={(e) => e.key === 'Enter' && !loading && handleParse()}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={loading || !text.trim()}
          style={{
            background: loading || !text.trim() ? '#CECECE' : '#131A48',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '0.5rem 1rem',
            fontSize: 12,
            fontWeight: 700,
            cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Parsing…' : 'Parse Rule'}
        </button>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          PDF examples — click to try
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PDF_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => { setText(ex); setErrors([]); setPendingRule(null) }}
              style={{
                textAlign: 'left',
                background: '#f7f7f9',
                border: '1px solid #e8e8ec',
                borderRadius: 4,
                padding: '0.35rem 0.5rem',
                fontSize: 11,
                color: '#131A48',
                cursor: 'pointer',
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner errors={errors} />

      {pendingRule && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem 0.9rem',
            background: '#f7f9ff',
            border: '1px solid #CECECE',
            borderLeft: '3px solid #FF5800',
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#131A48', marginBottom: 4 }}>
            Confirm parsed rule
          </div>
          <div style={{ fontSize: 12, color: '#333', marginBottom: '0.65rem' }}>
            {formatRuleSummary(pendingRule)}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                background: '#1e5c2c',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '0.4rem 1rem',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              style={{
                background: '#fff',
                color: '#131A48',
                border: '1px solid #CECECE',
                borderRadius: 4,
                padding: '0.4rem 1rem',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
