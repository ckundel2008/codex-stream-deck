// Public entry point for programmatic use.
export { CodexMicroEmulator, SLOT_COUNT } from "./emulator.js";
export { Link } from "./link.js";
export { SocketTransport } from "./transports/socket.js";
export { SocketServerTransport } from "./transports/socket-server.js";
export { LoopbackTransport } from "./transports/loopback.js";
export { StreamDeckBackend } from "./streamdeck.js";
export { KeyboardInput } from "./keyboard-input.js";
export * as protocol from "./protocol.js";
export * as states from "./states.js";
export * as keycaps from "./keycaps.js";
