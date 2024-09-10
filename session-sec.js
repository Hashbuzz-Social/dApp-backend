const crypto = require('crypto');

const generateRandomString = (length) => {
  return crypto.randomBytes(length).toString('hex');
};

const sessionSecret = generateRandomString(32);
console.log(`SESSION_SECRET=${sessionSecret}`);