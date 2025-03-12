export function parseRedisURL(redisURL: string): { host: string, port: number } {
    const url = new URL(redisURL);
    return {
        host: url.hostname,
        port: parseInt(url.port, 10)
    };
}

// Example usage:
// const redisConfig = parseRedisURL('redis://localhost:6379');
// console.log(redisConfig); // { host: 'localhost', port: 6379 }