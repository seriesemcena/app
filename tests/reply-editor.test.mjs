import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comments = readFileSync(new URL('../src/app/comments/page.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/lib/store.ts', import.meta.url), 'utf8');

test('comment replies use the full composer with GIF, image and spoiler controls', () => {
  assert.match(comments, /function ReplyEditor\(/);
  assert.match(comments, /fetchGiphyGifs\(gifSearch, 18, controller\.signal\)/);
  assert.match(comments, /setPanel\('image'\)/);
  assert.match(comments, /setSpoiler\(current => !current\)/);
  assert.match(comments, /<textarea[\s\S]*comments\.replyPlaceholderFull/);
});

test('reply composer shares the compact plus-and-publish layout', () => {
  assert.match(comments, /const \[showMore, setShowMore\] = useState\(false\)/);
  assert.match(comments, /aria-label=\{t\('comments\.moreOptions'\)\}/);
  assert.match(comments, /name=\{showMore \|\| panel \? 'close' : 'plus'\}/);
  assert.match(comments, /background: hasContent \? T\.pink : T\.surface2[\s\S]*flex: 1/);
});

test('reply media and spoiler metadata are persisted and rendered', () => {
  assert.match(comments, /gifUrl: draft\.gifUrl/);
  assert.match(comments, /imageUrl: draft\.imageUrl/);
  assert.match(comments, /spoiler: draft\.spoiler/);
  assert.match(comments, /function ReplyItem\(/);
  assert.match(comments, /reply\.gifUrl \|\| reply\.imageUrl/);
  assert.match(comments, /reply\.spoiler && !spoilerRevealed/);
  assert.match(store, /replies\?: Array<\{[\s\S]*gifUrl\?: string;[\s\S]*imageUrl\?: string;[\s\S]*spoiler\?: boolean;/);
});

test('reply avatars fall back to the current public profile by uid', () => {
  assert.match(comments, /dbProfileStore\.getOptional\(getDB\(\), reply\.uid\)/);
  assert.match(comments, /profile\.avatarThumbImage \|\| profile\.avatarImage/);
  assert.match(comments, /localProfile\.avatarThumbImage \|\| localProfile\.avatarImage \|\| user\.photoURL/);
  assert.match(comments, /onError=\{\(\) => setAvatarFailed\(true\)\}/);
});

test('published replies stay in the card dropdown while the reply composer is docked', () => {
  const commentCardStart = comments.indexOf('function CommentCard(');
  const commentCardEnd = comments.indexOf('export default function CommentsPage', commentCardStart);
  const commentCard = comments.slice(commentCardStart, commentCardEnd);

  assert.match(comments, /Compositor fixo de comentários e respostas/);
  assert.match(comments, /replyOpenId \? \([\s\S]*<ReplyEditor[\s\S]*docked/);
  assert.match(commentCard, /Replies dropdown/);
  assert.doesNotMatch(commentCard, /<ReplyEditor/);
});

test('comment cards are edge-to-edge, alternate their background and toggle replies', () => {
  const commentCardStart = comments.indexOf('function CommentCard(');
  const commentCardEnd = comments.indexOf('export default function CommentsPage', commentCardStart);
  const commentCard = comments.slice(commentCardStart, commentCardEnd);

  assert.match(comments, /marginLeft: -16, marginRight: -16/);
  assert.match(comments, /background: index % 2 === 1 \? T\.card : 'transparent'/);
  assert.match(commentCard, /<SocialCard edgeToEdge>/);
  assert.match(commentCard, /\{replyCount > 0 && \(/);
  assert.match(commentCard, /aria-expanded=\{repliesExpanded\}/);
  assert.match(commentCard, /setRepliesExpanded\(expanded => !expanded\)/);
  assert.match(commentCard, /\{repliesExpanded && \(/);
  assert.match(commentCard, /t\('comments\.repliesTitle'\)/);
  assert.doesNotMatch(commentCard, /paddingLeft: 14|borderLeft: `2px solid \$\{T\.border\}`/);
});

test('open comments use a logo-free header and episode context', () => {
  assert.match(comments, /navTitle=\{t\('comments\.title'\)\}/);
  assert.match(comments, /showNavTitle/);
  assert.match(comments, /showLogo=\{false\}/);
  assert.match(comments, /storageKey\.match\(\/\^ep_\.\+_s\(\\d\+\)_e\(\\d\+\)\$\/i\)/);
  assert.match(comments, /t\('comments\.episodeContext'/);
  assert.match(comments, /\{contentTitle\}/);
  assert.match(comments, /\{episodeLabel\}/);
});

test('comment likes derive active state and count from persisted likedBy', () => {
  assert.match(comments, /rev\.likedBy\?\.includes\(currentUserId\)/);
  assert.match(comments, /const likedBy = \[\.\.\.\(r\.likedBy \|\| \[\]\)\]/);
  assert.match(comments, /return \{ \.\.\.r, likedBy, likes: likedBy\.length \}/);
  assert.match(comments, /rev\.likedBy\?\.length \?\? rev\.likes \?\? 0/);
  assert.doesNotMatch(comments, /const wasLiked = !!\(r as any\)\.liked/);
  assert.doesNotMatch(comments, /\(rev\.likes \|\| 0\) \+ \(liked \? 1 : 0\)/);
});

test('reply typography and avatar match the primary comment hierarchy', () => {
  assert.match(comments, /width: 40, height: 40, borderRadius: 20/);
  assert.match(comments, /<Txt size=\{14\} weight=\{800\}>\{reply\.user\}<\/Txt>/);
  assert.match(comments, /<Txt size=\{15\} color=\{T\.t1\}/);
  assert.match(comments, /<Txt size=\{11\} color=\{T\.t3\}>\{timeAgo\(reply\.date\)\}<\/Txt>/);
});
