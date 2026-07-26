/** Runtime facade for command-registry helpers used across lazy boundaries. */
// cross-wms: listChatCommands lives in ./commands-registry-list.js and
// normalizeCommandBody lives in ./commands-registry-normalize.js, mirroring the
// openclaw split where both were re-exported from ./commands-registry.js.
export { listChatCommands } from "./commands-registry-list.js";
export { normalizeCommandBody } from "./commands-registry-normalize.js";
