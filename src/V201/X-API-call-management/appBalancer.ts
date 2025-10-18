// App-level traffic distribution and load balancing
let lastAppIndex = 0;

export function getNextApp(apps: string[]): string {
  if (apps.length === 0) return '';
  lastAppIndex = (lastAppIndex + 1) % apps.length;
  return apps[lastAppIndex];
}
