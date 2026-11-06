#!/usr/bin/env bun

/**
 * X Profile — Look up user profiles via API v2.
 *
 * Usage:
 *   bun run profile.ts <username>
 *   bun run profile.ts <username> --tweets 10
 *   bun run profile.ts --me        # the account posting uses, as JSON {id, username, name, auth}
 */

import { bearerFetch, oauth1Fetch, oauth2Fetch, hasOAuth2Store, credentials, API_BASE } from "./x-client";

/**
 * The account a post would go out as: the OAuth 2.0 store when one is configured, else the OAuth 1.0a
 * fallback keys. Lets the agent (and the broadcast skill) name the exact target account before a post.
 */
async function whoAmI(): Promise<{ id: string; username: string; name: string; auth: string }> {
  const url = `${API_BASE}/users/me`;
  let me: any;
  let auth: string;
  if (hasOAuth2Store()) {
    me = await oauth2Fetch(url);
    auth = "oauth2";
  } else if (credentials.apiKey && credentials.apiKeySecret && credentials.accessToken && credentials.accessTokenSecret) {
    me = await oauth1Fetch(url, "GET");
    auth = "oauth1-text-only";
  } else {
    throw new Error("No posting credentials: configure the OAuth 2.0 token store or the OAuth 1.0a keys (Setup.md).");
  }
  const d = me?.data;
  if (typeof d?.id !== "string" || typeof d?.username !== "string") throw new Error("X returned no account for /users/me");
  return { id: d.id, username: d.username, name: typeof d.name === "string" ? d.name : d.username, auth };
}

async function lookupProfile(username: string, includeTweets = 0) {
  const url = new URL(`${API_BASE}/users/by/username/${username}`);
  url.searchParams.set("user.fields", "created_at,description,location,public_metrics,url,verified,profile_image_url");

  const data = await bearerFetch(url.toString());
  if (!data.data) throw new Error(`User not found: @${username}`);

  const profile = data.data;
  console.log(`\n@${profile.username} (${profile.name})`);
  if (profile.description) console.log(`  Bio: ${profile.description}`);
  if (profile.location) console.log(`  Location: ${profile.location}`);
  if (profile.url) console.log(`  URL: ${profile.url}`);
  if (profile.public_metrics) {
    const m = profile.public_metrics;
    console.log(`  Followers: ${m.followers_count} | Following: ${m.following_count} | Tweets: ${m.tweet_count}`);
  }
  console.log(`  Joined: ${profile.created_at}`);
  console.log(`  ID: ${profile.id}`);

  if (includeTweets > 0) {
    const tweetsUrl = new URL(`${API_BASE}/users/${profile.id}/tweets`);
    tweetsUrl.searchParams.set("max_results", String(Math.min(includeTweets, 100)));
    tweetsUrl.searchParams.set("tweet.fields", "created_at,public_metrics");
    tweetsUrl.searchParams.set("exclude", "retweets,replies");

    const tweetsData = await bearerFetch(tweetsUrl.toString());
    const tweets = tweetsData.data || [];
    console.log(`\n  Recent tweets (${tweets.length}):`);
    for (const t of tweets) {
      console.log(`    ${t.text.slice(0, 100)}${t.text.length > 100 ? "..." : ""}`);
      if (t.public_metrics) console.log(`    Likes: ${t.public_metrics.like_count} | RT: ${t.public_metrics.retweet_count}`);
      console.log();
    }
  }

  return profile;
}

// --- Main ---

const args = process.argv.slice(2);
if (args.includes("--me")) {
  try {
    console.log(JSON.stringify(await whoAmI()));
    process.exit(0);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}
const tweetsIdx = args.indexOf("--tweets");
const tweetCount = tweetsIdx >= 0 ? parseInt(args[tweetsIdx + 1] || "10") : 0;
const username = args.filter((a, i) => a !== "--tweets" && (tweetsIdx < 0 || i !== tweetsIdx + 1))[0];

if (!username) {
  console.log("Usage: bun run profile.ts <username> [--tweets N] | --me");
  console.log("Examples:");
  console.log("  bun run profile.ts <username>");
  console.log("  bun run profile.ts <username> --tweets 10");
  process.exit(0);
}

try {
  await lookupProfile(username.replace(/^@/, ""), tweetCount);
} catch (err: any) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
