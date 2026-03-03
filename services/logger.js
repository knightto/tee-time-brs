function now() {
  return new Date().toISOString();
}

function base(level, msg, data = {}) {
  const payload = { t: now(), level, msg, ...data };
  console.log(JSON.stringify(payload));
}

module.exports = {
  info(msg, data) {
    base('info', msg, data);
  },
  warn(msg, data) {
    base('warn', msg, data);
  },
  error(msg, data) {
    base('error', msg, data);
  },
};
