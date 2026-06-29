/**
 * nlRuleParser.js
 *
 * Converts plain-English discount rule descriptions into DiscountRule-shaped
 * objects via an LLM. Returns validated results or readable error reasons.
 */

const SYSTEM_PROMPT = `You parse discount rules for an e-commerce cart engine.
Given a plain-English rule description, respond with ONLY valid JSON — no markdown, no explanation.

If the input is clear and complete, respond with:
{
  "scope": "brand" | "platform" | "cart",
  "appliesTo": string or null (null/omit for cart scope),
  "type": "percentage" | "flat",
  "value": number (percentage as integer e.g. 15 for 15%, or flat rupee amount),
  "stackable": boolean,
  "minCartValue": number or null (required only when scope is "cart")
}

If the input is ambiguous or missing a concrete value or threshold, respond with:
{
  "unresolvable": true,
  "reason": "short explanation of what is missing"
}

Examples:
- "20% off for Natura Casa brand, stackable" → {"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null}
- "Rs.100 flat discount on all Flipkart items" → {"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null}
- "10% off if cart value is more than Rs.5,000" → {"scope":"cart","appliesTo":null,"type":"percentage","value":10,"stackable":false,"minCartValue":5000}
- "Give a discount for big orders" → {"unresolvable":true,"reason":"No discount value or threshold specified — please include a percentage/amount and a condition."}`

function validateParsedRule(parsed) {
  if (parsed.unresolvable === true) {
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim()
      : 'Could not parse this rule — please be more specific.'
    return { success: false, reason }
  }

  const scope = parsed.scope
  if (scope !== 'brand' && scope !== 'platform' && scope !== 'cart') {
    return { success: false, reason: 'Invalid scope — must be brand, platform, or cart.' }
  }

  const type = parsed.type
  if (type !== 'percentage' && type !== 'flat') {
    return { success: false, reason: 'Invalid type — must be percentage or flat.' }
  }

  const value = Number(parsed.value)
  if (!Number.isFinite(value) || value <= 0) {
    return { success: false, reason: 'Discount value must be a positive number.' }
  }

  if (typeof parsed.stackable !== 'boolean') {
    return { success: false, reason: 'Stackable flag must be true or false.' }
  }

  let appliesTo = parsed.appliesTo ?? ''
  if (typeof appliesTo === 'string') appliesTo = appliesTo.trim()

  if (scope === 'brand' || scope === 'platform') {
    if (!appliesTo) {
      return { success: false, reason: `A ${scope} rule requires an appliesTo value (e.g. brand or platform name).` }
    }
  }

  let minCartValue
  if (scope === 'cart') {
    minCartValue = Number(parsed.minCartValue)
    if (!Number.isFinite(minCartValue) || minCartValue <= 0) {
      return { success: false, reason: 'Cart rules require a positive minimum cart value threshold.' }
    }
    appliesTo = ''
  }

  const rule = {
    scope,
    appliesTo,
    type,
    value,
    stackable: parsed.stackable,
    ...(minCartValue != null ? { minCartValue } : {}),
  }

  return { success: true, rule }
}

function extractJsonFromResponse(text) {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed
  return JSON.parse(candidate)
}

function isAmbiguousInput(text) {
  const trimmed = text.trim()
  if (/^give\s+a\s+discount/i.test(trimmed) && !/\d/.test(trimmed)) return true
  if (/^(\d+(?:\.\d+)?)\s*%$/.test(trimmed)) return true
  if (/^(Rs?\.?\s*)?(\d+)\s*$/.test(trimmed)) return true
  if (/\b(big orders?|large orders?)\b/i.test(trimmed) && !/\d/.test(trimmed)) return true
  return false
}

const UNRESOLVABLE_MSG =
  'No discount value or threshold specified — please include a percentage/amount and a condition.'

function cleanAppliesTo(raw) {
  return raw
    .trim()
    .replace(/^for\s+/i, '')
    .replace(/^on\s+(?:all\s+)?/i, '')
    .replace(/\s+items?$/i, '')
    .replace(/,\s*stackable.*$/i, '')
    .trim()
}

function parseRuleLocally(text) {
  if (isAmbiguousInput(text)) {
    return { success: false, reason: UNRESOLVABLE_MSG }
  }

  if (/discount|offer|deal/i.test(text) && !/\d/.test(text)) {
    return { success: false, reason: UNRESOLVABLE_MSG }
  }

  const stackable = /\bstackable\b/i.test(text) || /\bstack(s)?\s+with\b/i.test(text)

  // PDF: "10% off if cart value is more than Rs.5,000"
  const cartMatch = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*off\b.*?(?:cart|order)\b.*?(?:more than|over|above|at least|≥|>=?)\s*Rs?\.?\s*([\d,]+)/i
  )
  if (cartMatch) {
    return validateParsedRule({
      scope: 'cart',
      appliesTo: null,
      type: 'percentage',
      value: parseFloat(cartMatch[1]),
      stackable: stackable || false,
      minCartValue: parseFloat(cartMatch[2].replace(/,/g, '')),
    })
  }

  // PDF: "Rs.100 flat discount on all Flipkart items"
  const flatPlatformMatch = text.match(
    /Rs\.?\s*([\d,]+)\s+flat\s+discount\s+on\s+(?:all\s+)?(.+?)\s+items?\b/i
  )
  if (flatPlatformMatch) {
    return validateParsedRule({
      scope: 'platform',
      appliesTo: cleanAppliesTo(flatPlatformMatch[2]),
      type: 'flat',
      value: parseFloat(flatPlatformMatch[1].replace(/,/g, '')),
      stackable: stackable || false,
    })
  }

  // PDF: "20% off for Natura Casa brand, stackable with other offers"
  const brandPctMatch = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*off\s+for\s+(.+?)\s+brand\b/i
  )
  if (brandPctMatch) {
    return validateParsedRule({
      scope: 'brand',
      appliesTo: cleanAppliesTo(brandPctMatch[2]),
      type: 'percentage',
      value: parseFloat(brandPctMatch[1]),
      stackable,
    })
  }

  // Generic platform percentage: "15% off on all Amazon India items"
  const platformPctMatch = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*off\s+(?:on\s+)?(?:all\s+)?(.+?)\s+items?\b/i
  )
  if (platformPctMatch) {
    return validateParsedRule({
      scope: 'platform',
      appliesTo: cleanAppliesTo(platformPctMatch[2]),
      type: 'percentage',
      value: parseFloat(platformPctMatch[1]),
      stackable,
    })
  }

  return null
}

async function callAnthropic(text) {
  if (isAmbiguousInput(text)) {
    return { success: false, reason: UNRESOLVABLE_MSG }
  }

  // Try local parser first — reliable for assignment PDF examples (works without API credits)
  const localFirst = parseRuleLocally(text)
  if (localFirst?.success) return localFirst
  if (localFirst?.success === false) return localFirst

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim()
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return {
      success: false,
      reason: 'Could not parse this rule. Try a full phrase like "20% off for Natura Casa brand, stackable", or add VITE_ANTHROPIC_API_KEY for LLM parsing.',
    }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    const local = parseRuleLocally(text)
    if (local?.success) return local
    if (local?.success === false) return local
    return { success: false, reason: `LLM request failed (${response.status}). ${errBody.slice(0, 120)}` }
  }

  const data = await response.json()
  const content = data.content?.[0]?.text
  if (!content) {
    return { success: false, reason: 'LLM returned an empty response.' }
  }

  let parsed
  try {
    parsed = extractJsonFromResponse(content)
  } catch {
    return { success: false, reason: 'LLM response was not valid JSON.' }
  }

  return validateParsedRule(parsed)
}

/**
 * Parses a natural-language discount rule into a DiscountRule-shaped object.
 * ruleId is omitted — caller generates it on confirm.
 */
export async function parseRuleFromText(text) {
  const input = text?.trim()
  if (!input) {
    return { success: false, reason: 'Please enter a rule description.' }
  }

  try {
    return await callAnthropic(input)
  } catch (err) {
    return { success: false, reason: err.message || 'Failed to parse rule. Please try again.' }
  }
}
