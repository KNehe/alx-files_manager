import crypto from 'crypto';

function hashPassword(password) {
  const hash = crypto.createHash('sha1');
  const data = hash.update(password, 'utf-8');
  const genHash = data.digest('hex');
  return genHash;
}

module.exports = hashPassword;
