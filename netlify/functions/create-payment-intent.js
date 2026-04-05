/**
 * Netlify Serverless Function — Stripe PaymentIntent Creator
 * Grand Azura Hotel Booking System
 *
 * Environment variables required (set in Netlify dashboard):
 *   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
 *
 * POST /api/create-payment-intent
 * Body: { roomId, roomName, pricePerNight, nights, checkin, checkout,
 *         guestName, guestEmail, guestPhone, specialRequests, currency }
 */

'use strict';

const https = require('https');

/** Makes a request to the Stripe REST API using only built-in Node https */
function stripePost(path, params, secretKey) {
  return new Promise((resolve, reject) => {
    // Stripe uses application/x-www-form-urlencoded for simple POST
    const body = encodeParams(params);

    const options = {
      hostname: 'api.stripe.com',
      port: 443,
      path: `/v1/${path}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'Stripe-Version': '2024-04-10',
        'User-Agent': 'GrandAzura/1.0 HugoNetlify',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'Stripe error'));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error('Failed to parse Stripe response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Recursively encode params to x-www-form-urlencoded (supports nested objects) */
function encodeParams(params, prefix = '') {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (typeof v === 'object' && !Array.isArray(v)) {
        return encodeParams(v, key);
      }
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`;
    })
    .join('&');
}

/** CORS headers for all responses */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY environment variable not set.');
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Server configuration error.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid JSON body.' }),
    };
  }

  const {
    roomId,
    roomName,
    pricePerNight,
    nights,
    checkin,
    checkout,
    guestName,
    guestEmail,
    guestPhone    = '',
    specialRequests = '',
    currency      = 'eur',
  } = payload;

  // ── Validation ────────────────────────────────────────────────────────────
  const missing = ['roomId','roomName','pricePerNight','nights','checkin','checkout','guestName','guestEmail']
    .filter(k => !payload[k]);

  if (missing.length) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
    };
  }

  const numNights    = parseInt(nights, 10);
  const pricePerNightNum = parseFloat(pricePerNight);

  if (isNaN(numNights) || numNights < 1 || numNights > 90) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid number of nights (1–90).' }),
    };
  }

  if (isNaN(pricePerNightNum) || pricePerNightNum < 50) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid price.' }),
    };
  }

  // Amount in smallest currency unit (cents for EUR)
  const totalEur   = Math.round(pricePerNightNum * numNights * 100); // in cents
  const taxRate    = 0.10; // 10% VAT
  const baseAmount = Math.round(totalEur / (1 + taxRate));
  const taxAmount  = totalEur - baseAmount;

  // ── Create Stripe PaymentIntent ───────────────────────────────────────────
  try {
    const intent = await stripePost('payment_intents', {
      amount:   totalEur,
      currency: currency,
      receipt_email: guestEmail,
      description: `Grand Azura Hotel — ${roomName} (${numNights} night${numNights > 1 ? 's' : ''})`,
      statement_descriptor_suffix: 'GRAND AZURA',
      automatic_payment_methods: { enabled: 'true' },
      metadata: {
        hotel:           'Grand Azura Hotel & Spa',
        room_id:          roomId,
        room_name:        roomName,
        nights:           String(numNights),
        checkin:          checkin,
        checkout:         checkout,
        guest_name:       guestName,
        guest_email:      guestEmail,
        guest_phone:      guestPhone,
        special_requests: specialRequests.substring(0, 500),
        price_per_night:  String(pricePerNightNum),
        total_eur_cents:  String(totalEur),
        tax_eur_cents:    String(taxAmount),
      },
    }, secretKey);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        clientSecret: intent.client_secret,
        intentId:     intent.id,
        amount:       totalEur,
        baseAmount:   baseAmount,
        taxAmount:    taxAmount,
        currency:     currency,
      }),
    };

  } catch (err) {
    console.error('Stripe error:', err.message);
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || 'Payment processing error. Please try again.' }),
    };
  }
};
