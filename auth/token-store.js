(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MirekiTokenStore = api;
})(globalThis, () => {
  function createTokenStore(storage, prefix = "auth.tokens.") {
    const key = (serviceId) => `${prefix}${serviceId}`;
    return {
      async get(serviceId) { return (await storage.get(key(serviceId)))[key(serviceId)] || null; },
      async set(serviceId, token) { await storage.set({ [key(serviceId)]: token }); },
      async remove(serviceId) { await storage.remove(key(serviceId)); },
    };
  }
  return { createTokenStore };
});
