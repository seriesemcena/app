'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const db = getFirestore();

const PLATFORMS = new Set(['web', 'pwa', 'ios', 'android']);
const EVENTS = new Set(['view', 'click', 'close']);
const FREQUENCIES = new Set(['every_visit', 'once_session', 'once_day', 'once_user', 'custom']);

function clean(value, max = 300) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function millis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function audienceMatches(audiences, auth, profile) {
  const values = Array.isArray(audiences) ? audiences : [];
  if (values.includes('all')) return true;
  if (!auth) return values.includes('visitors');
  if (values.includes('registered')) return true;
  const isPro = profile?.proMember === true;
  return isPro ? values.includes('pro') : values.includes('free');
}

function frequencyAllows(banner, state, now) {
  if (!state) return true;
  const frequency = FREQUENCIES.has(banner.frequency) ? banner.frequency : 'once_session';
  const lastAt = Math.max(Number(state.lastViewedAtMs || 0), Number(state.lastClosedAtMs || 0));
  if (frequency === 'every_visit' || frequency === 'once_session') return true;
  if (frequency === 'once_user') return !lastAt;
  const interval = frequency === 'once_day'
    ? 24 * 60 * 60 * 1000
    : Math.max(1, Math.min(24 * 365, Number(banner.frequencyHours || 24))) * 60 * 60 * 1000;
  return !lastAt || now - lastAt >= interval;
}

function publicCampaign(snapshot) {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    imageDesktopUrl: clean(data.imageDesktopUrl, 1500),
    imageMobileUrl: clean(data.imageMobileUrl, 1500),
    altText: clean(data.altText, 240),
    destinationUrl: clean(data.destinationUrl, 1500),
    openTarget: data.openTarget === 'new' ? 'new' : 'same',
    frequency: FREQUENCIES.has(data.frequency) ? data.frequency : 'once_session',
    frequencyHours: Number(data.frequencyHours || 24),
    priority: Number(data.priority || 0),
  };
}

exports.getEligiblePopupBanner = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const platform = PLATFORMS.has(request.data?.platform) ? request.data.platform : 'web';
  const excludedIds = new Set((Array.isArray(request.data?.excludedIds) ? request.data.excludedIds : [])
    .map((value) => clean(value, 160)).filter(Boolean).slice(0, 50));
  const now = Date.now();
  let profile = null;
  if (request.auth?.uid) profile = (await db.doc(`users/${request.auth.uid}`).get()).data()?.profile || {};

  const campaignPage = await db.collection('public_popup_banners').orderBy('priority', 'desc').limit(50).get();
  const candidates = campaignPage.docs.filter((snapshot) => {
    const data = snapshot.data() || {};
    const startsAt = millis(data.startsAt);
    const endsAt = millis(data.endsAt);
    return !excludedIds.has(snapshot.id)
      && data.active === true
      && (!startsAt || startsAt <= now)
      && (!endsAt || endsAt > now)
      && audienceMatches(data.audiences, request.auth, profile)
      && clean(data.imageDesktopUrl, 1500);
  }).sort((left, right) => Number(right.data()?.priority || 0) - Number(left.data()?.priority || 0));

  if (!request.auth?.uid) return { banner: candidates[0] ? publicCampaign(candidates[0]) : null, platform };
  if (!candidates.length) return { banner: null, platform };

  const stateRefs = candidates.map((snapshot) => db.doc(`users/${request.auth.uid}/popupBannerState/${snapshot.id}`));
  const stateSnapshots = await db.getAll(...stateRefs);
  const allowed = candidates.find((snapshot, index) => frequencyAllows(snapshot.data(), stateSnapshots[index].data(), now));
  return { banner: allowed ? publicCampaign(allowed) : null, platform };
});

exports.trackPopupBannerEvent = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const bannerId = clean(request.data?.bannerId, 160);
  const event = clean(request.data?.event, 20);
  const eventId = clean(request.data?.eventId, 180);
  const platform = PLATFORMS.has(request.data?.platform) ? request.data.platform : 'web';
  if (!bannerId || !eventId || !EVENTS.has(event)) throw new HttpsError('invalid-argument', 'Evento de banner inválido.');

  const campaignRef = db.doc(`popup_banners/${bannerId}`);
  const receiptId = crypto.createHash('sha256').update(`${bannerId}:${event}:${eventId}`).digest('hex');
  const receiptRef = db.doc(`popup_banner_event_receipts/${receiptId}`);
  const dateKey = new Date().toISOString().slice(0, 10);
  const metricRef = db.doc(`popup_banner_metrics/${bannerId}_${dateKey}_${platform}`);
  const stateRef = request.auth?.uid ? db.doc(`users/${request.auth.uid}/popupBannerState/${bannerId}`) : null;
  const field = event === 'view' ? 'views' : event === 'click' ? 'clicks' : 'closes';

  const recorded = await db.runTransaction(async (transaction) => {
    const campaign = await transaction.get(campaignRef);
    const receipt = await transaction.get(receiptRef);
    if (!campaign.exists) throw new HttpsError('not-found', 'Campanha não encontrada.');
    if (receipt.exists) return false;
    const campaignData = campaign.data() || {};
    transaction.create(receiptRef, {
      bannerId, event, platform, uid: request.auth?.uid || null,
      createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 45 * 24 * 60 * 60 * 1000),
    });
    transaction.set(campaignRef, { [`metrics.${field}`]: FieldValue.increment(1), metricsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(metricRef, {
      bannerId, campaign: clean(campaignData.name, 120), date: dateKey, platform,
      [field]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (stateRef) {
      const update = { bannerId, frequency: campaignData.frequency || 'once_session', updatedAt: FieldValue.serverTimestamp() };
      if (event === 'view') update.lastViewedAtMs = Date.now();
      if (event === 'close') update.lastClosedAtMs = Date.now();
      transaction.set(stateRef, update, { merge: true });
    }
    return true;
  });
  return { recorded };
});
