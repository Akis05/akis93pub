export async function register() {
  // The SMPP session, BullMQ workers, and their graceful shutdown handling
  // now live in the standalone smpp-bridge/ service (see akisSp.md) — this
  // app no longer holds any persistent SMPP/Redis connection to shut down.
}
