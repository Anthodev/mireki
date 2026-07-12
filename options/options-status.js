(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiOptionsStatus = api;
})(globalThis, () => {
  function resultNotice(result) {
    if (result?.ok && result.status?.revocationFailed) return "Disconnected locally, but remote access could not be revoked. Reconnect or retry later.";
    if (result?.ok) return "Account settings updated.";
    return result?.error === "Authentication failed" ? result.error : "Authentication failed.";
  }
  return { resultNotice };
});
