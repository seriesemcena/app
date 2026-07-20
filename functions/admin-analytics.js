'use strict';

const PERIODS = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

function mediaType(activity) {
  if (activity.titleType === 'movie' || String(activity.titleKey || '').startsWith('movie_')) return 'movie';
  if (activity.titleType === 'tv' || String(activity.titleKey || '').startsWith('tv_')) return 'tv';
  return null;
}

function activityTime(activity) {
  const parsed = new Date(activity.createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function rankingEntry(activity, count) {
  return {
    titleKey: String(activity.titleKey || ''),
    titleId: String(activity.titleId || String(activity.titleKey || '').split('_').at(-1) || ''),
    titleName: String(activity.titleName || 'Título sem nome'),
    titleType: mediaType(activity),
    poster: activity.poster || activity.titleImageUrl || null,
    count,
  };
}

function topEntries(bucket, limit = 10) {
  return [...bucket.values()]
    .sort((left, right) => right.count - left.count || left.titleName.localeCompare(right.titleName, 'pt-BR'))
    .slice(0, limit);
}

/**
 * Builds privacy-safe, deduplicated title rankings from activity documents.
 * The same account/title pair counts once per category and period, so changing
 * a list status repeatedly cannot artificially inflate a title.
 */
function buildTitleRankings(activities, now = Date.now(), limit = 10) {
  const rankings = {};
  for (const [period, windowMs] of Object.entries(PERIODS)) {
    const since = now - windowMs;
    const buckets = {
      added: new Map(),
      watched: new Map(),
    };
    const seen = {
      added: new Set(),
      watched: new Set(),
    };

    for (const activity of activities) {
      const type = mediaType(activity);
      const timestamp = activityTime(activity);
      if (!type || timestamp < since || timestamp > now) continue;
      const category = activity.action === 'watched'
        ? 'watched'
        : (activity.action === 'want' || activity.action === 'watching' ? 'added' : null);
      if (!category) continue;

      const titleKey = String(activity.titleKey || `${type}_${activity.titleId || ''}`);
      const uniqueKey = `${activity.uid || activity.userId || 'unknown'}:${titleKey}`;
      if (seen[category].has(uniqueKey)) continue;
      seen[category].add(uniqueKey);

      const current = buckets[category].get(titleKey);
      buckets[category].set(titleKey, rankingEntry(activity, (current?.count || 0) + 1));
    }

    rankings[period] = {
      added: topEntries(buckets.added, limit),
      watched: topEntries(buckets.watched, limit),
    };
  }
  return rankings;
}

module.exports = { PERIODS, buildTitleRankings };
