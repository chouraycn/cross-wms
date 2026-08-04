// Aggregated private deps for server/engine/secrets.
//
// This file is the refactor收口点 introduced by the in-progress secrets
// migration (see server/engine/secrets/shared.ts, which imports these two
// symbols from "./_deps.js"). It intentionally re-exports the canonical
// implementations rather than duplicating them, so the rest of the secrets
// module can keep a single internal dependency surface.
export { privateFileStoreSync } from "../infra/private-file-store.js";
export { replaceFileAtomicSync } from "../infra/_fs-safe-stubs.js";
