export type TMDBTitleVideo = {
  key?: string;
  site?: string;
  type?: string;
  official?: boolean;
  published_at?: string;
};

function videoScore(video: TMDBTitleVideo) {
  const type = video.type?.toLowerCase();
  const site = video.site?.toLowerCase();
  let score = 0;

  if (type === 'trailer') score += 100;
  else if (type === 'teaser') score += 60;
  else if (type === 'clip') score += 20;

  if (video.official) score += 30;
  if (site === 'youtube') score += 10;

  return score;
}

/** Chooses the most useful externally playable TMDB video for a title. */
export function selectTitleTrailer(videos: unknown): TMDBTitleVideo | null {
  if (!Array.isArray(videos)) return null;

  const playable = videos.filter((video): video is TMDBTitleVideo => {
    if (!video || typeof video !== 'object') return false;
    const candidate = video as TMDBTitleVideo;
    const site = candidate.site?.toLowerCase();
    return typeof candidate.key === 'string'
      && candidate.key.trim().length > 0
      && (site === 'youtube' || site === 'vimeo');
  });

  return playable
    .map((video, index) => ({ video, index, score: videoScore(video) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.video ?? null;
}

export function titleVideoUrl(video: TMDBTitleVideo | null): string | null {
  if (!video?.key || !video.site) return null;

  const key = encodeURIComponent(video.key.trim());
  if (video.site.toLowerCase() === 'youtube') {
    return `https://www.youtube.com/watch?v=${key}`;
  }
  if (video.site.toLowerCase() === 'vimeo') {
    return `https://vimeo.com/${key}`;
  }
  return null;
}
