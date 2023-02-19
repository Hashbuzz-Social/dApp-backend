import crypto from "crypto";

// Method to set salt and hash the password for a user
// setPassword method first creates a salt unique for every user
// then it hashes the salt with user password and creates a hash
// this hash is stored in the database as user password
const createPassword = (password: string) => {
  // Creating a unique salt for a particular user
  const salt = crypto.randomBytes(16).toString("hex");

  // Hashing user's salt and password with 1000 iterations, 64 length and sha512 digest
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, `sha512`).toString(`hex`);
  return { salt, hash };
};



// Method to check the entered password is correct or not
// valid password method checks whether the user
// password is correct or not
// It takes the user password from the request
// and salt from user database entry
// It then hashes user password and salt
// then checks if this generated hash is equal
// to user's hash in the database or not
// If the user's hash is equal to generated hash
// then the password is correct otherwise not
const validPassword = (password: string, currentUserSalt: string, currentUserHash: string) => {
  const hash = crypto.pbkdf2Sync(password, currentUserSalt, 1000, 64, `sha512`).toString(`hex`);
  return currentUserHash === hash;
};

export default {
  createPassword,
  validPassword,
};

