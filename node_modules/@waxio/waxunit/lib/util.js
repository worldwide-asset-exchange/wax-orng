/**
 * Generates a random *.wam account name
 *
 * @return {string} a random wam account
 * @api public
 */
function randomWamAccount() {
  const chars = 'abcdefghijklmnopqrstuvwxyz12345.';
  const length = Math.ceil(Math.random() * 5) + 3;
  let name = '.wam';
  for (let i = 0; i < length; i++) {
    let c = Math.floor(Math.random() * chars.length);
    name = chars[c] + name;
  }
  return name;
}

/**
 * Sleeps for the given milliseconds duration
 *
 * @param {Number} milliseconds number of milliseconds to sleep
 * @return {Promise}
 * @api public
 */
function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

module.exports = {
  randomWamAccount,
  sleep,
};
