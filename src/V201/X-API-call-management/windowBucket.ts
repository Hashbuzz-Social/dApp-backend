// 15-minute window bucketing utility for campaign scheduling

export function getCurrentWindowBucket(): number {
  // Returns the Unix timestamp (seconds) for the start of the current 15-min window
  const now = Math.floor(Date.now() / 1000);
  return now - (now % (15 * 60));
}

export function getNextWindowBucket(): number {
  // Returns the Unix timestamp (seconds) for the start of the next 15-min window
  return getCurrentWindowBucket() + 15 * 60;
}
