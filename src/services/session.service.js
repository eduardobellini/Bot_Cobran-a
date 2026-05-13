const sessions = new Map();

function getSession(from) {
  if (!sessions.has(from)) {
    sessions.set(from, {
      step: 'inicio',
      data: {}
    });
  }

  return sessions.get(from);
}

function deleteSession(from) {
  sessions.delete(from);
}

module.exports = {
  getSession,
  deleteSession
};