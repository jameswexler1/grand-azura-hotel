/**
 * Stripe Webhook Handler — Grand Azura Hotel
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET     — whsec_... (from Stripe Dashboard > Webhooks)
 *
 * Configure in Stripe Dashboard:
 *   Endpoint URL: https://your-site.netlify.app/.netlify/functions/booking-webhook
 *   Events to listen for: payment_intent.succeeded, payment_intent.payment_failed
 */

'use strict';

const https  = require('https');
const crypto = require('crypto');

/** Verify Stripe webhook signature */
function verifyStripeSignature(payload, sigHeader, secret) {
  const parts  = sigHeader.split(',');
  const tsItem = parts.find(p => p.startsWith('t='));
  const v1Item = parts.find(p => p.startsWith('v1='));
  if (!tsItem || !v1Item) throw new Error('Invalid signature header');

  const timestamp  = tsItem.split('=')[1];
  const signature  = v1Item.split('=')[1];
  const signedData = `${timestamp}.${payload}`;
  const expected   = crypto
    .createHmac('sha256', secret)
    .update(signedData, 'utf8')
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    throw new Error('Webhook signature verification failed');
  }

  // Reject events older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
  if (age > 300) throw new Error('Webhook timestamp too old');

  return JSON.parse(payload);
}

/** Send a simple booking confirmation email via Netlify Email (or log) */
async function handlePaymentSuccess(intent) {
  const m = intent.metadata;
  console.log('✅ BOOKING CONFIRMED:', {
    reference:  intent.id,
    guest:      m.guest_name,
    email:      m.guest_email,
    room:       m.room_name,
    checkin:    m.checkin,
    checkout:   m.checkout,
    nights:     m.nights,
    total:      `€${(intent.amount / 100).toFixed(2)}`,
    timestamp:  new Date().toISOString(),
  });

  // ── TODO: Send confirmation email ─────────────────────────────────────────
  // Replace this block with your email provider:
  //
  // Option 1 — Netlify Email Integration:
  // await fetch('/.netlify/functions/emails/booking-confirmation', {
  //   method: 'POST',
  //   headers: { 'netlify-emails-secret': process.env.NETLIFY_EMAILS_SECRET },
  //   body: JSON.stringify({ to: m.guest_email, subject: '...', ... })
  // });
  //
  // Option 2 — SendGrid / Resend / Postmark:
  // See respective SDK docs.
  // ─────────────────────────────────────────────────────────────────────────
}

async function handlePaymentFailed(intent) {
  console.warn('⚠️ PAYMENT FAILED:', {
    intentId: intent.id,
    guest:    intent.metadata?.guest_name,
    reason:   intent.last_payment_error?.message,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sigHeader     = event.headers['stripe-signature'];

  if (!webhookSecret || !sigHeader) {
    return { statusCode: 400, body: 'Missing webhook configuration' };
  }

  let stripeEvent;
  try {
    stripeEvent = verifyStripeSignature(event.body, sigHeader, webhookSecret);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return { statusCode: 400, body: `Webhook error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(stripeEvent.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
    }
  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, body: 'Handler failed' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
