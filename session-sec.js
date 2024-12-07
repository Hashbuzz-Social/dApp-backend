const crypto = require('crypto');
const fs = require('fs');

const generateRandomString = (length) => {
  return crypto.randomBytes(length).toString('hex');
};

const keysObj = {
  J_ACCESS_TOKEN_SECRET: '',
  J_REFRESH_TOKEN_SECRET: '',
  ENCRYPTION_KEY: '',
  SESSION_SECRET: '',
};
keysObj.J_ACCESS_TOKEN_SECRET = generateRandomString(16);
keysObj.J_REFRESH_TOKEN_SECRET = generateRandomString(16);
keysObj.ENCRYPTION_KEY = generateRandomString(20);
keysObj.SESSION_SECRET = generateRandomString(32);

fs.writeFileSync('keys.json', JSON.stringify(keysObj, null, 2));
console.log('keys.json file has been saved.');
