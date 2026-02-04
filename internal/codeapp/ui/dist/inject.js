"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // node_modules/@floegence/flowersec-core/dist/proxy/constants.js
  var DEFAULT_MAX_CHUNK_BYTES = 256 * 1024;
  var DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;
  var DEFAULT_MAX_WS_FRAME_BYTES = 1024 * 1024;
  var DEFAULT_MAX_TIMEOUT_MS = 5 * 6e4;

  // node_modules/@floegence/flowersec-core/dist/utils/bin.js
  function u16be(n) {
    const b = new Uint8Array(2);
    const v = n >>> 0;
    b[0] = v >>> 8 & 255;
    b[1] = v & 255;
    return b;
  }
  function u32be(n) {
    const b = new Uint8Array(4);
    const v = n >>> 0;
    b[0] = v >>> 24 & 255;
    b[1] = v >>> 16 & 255;
    b[2] = v >>> 8 & 255;
    b[3] = v & 255;
    return b;
  }
  function readU32be(buf, off) {
    return (buf[off] << 24 | buf[off + 1] << 16 | buf[off + 2] << 8 | buf[off + 3]) >>> 0;
  }

  // node_modules/@floegence/flowersec-core/dist/framing/jsonframe.js
  var DEFAULT_MAX_JSON_FRAME_BYTES = 1 << 20;
  var te = new TextEncoder();
  var td = new TextDecoder();

  // node_modules/@floegence/flowersec-core/dist/utils/errors.js
  var AbortError = class extends Error {
    constructor(message = "aborted") {
      super(message);
      this.name = "AbortError";
    }
  };

  // node_modules/@floegence/flowersec-core/dist/yamux/errors.js
  var StreamEOFError = class extends Error {
    constructor(message = "eof") {
      super(message);
      this.name = "StreamEOFError";
    }
  };

  // node_modules/@floegence/flowersec-core/dist/yamux/byteReader.js
  var ByteReader = class {
    constructor(readChunk) {
      __publicField(this, "readChunk");
      __publicField(this, "chunks", []);
      __publicField(this, "chunkHead", 0);
      __publicField(this, "headOff", 0);
      __publicField(this, "buffered", 0);
      this.readChunk = readChunk;
    }
    // readExactly reads n bytes or throws on EOF.
    async readExactly(n) {
      if (n < 0)
        throw new Error("invalid length");
      while (this.buffered < n) {
        const chunk = await this.readChunk();
        if (chunk == null)
          throw new StreamEOFError();
        if (chunk.length === 0)
          continue;
        this.chunks.push(chunk);
        this.buffered += chunk.length;
      }
      const out = new Uint8Array(n);
      let outOff = 0;
      while (outOff < n) {
        const head = this.chunks[this.chunkHead];
        const avail = head.length - this.headOff;
        const need = n - outOff;
        const take = Math.min(avail, need);
        out.set(head.subarray(this.headOff, this.headOff + take), outOff);
        outOff += take;
        this.headOff += take;
        this.buffered -= take;
        if (this.headOff === head.length) {
          this.chunkHead++;
          this.headOff = 0;
          if (this.chunkHead > 1024 && this.chunkHead * 2 > this.chunks.length) {
            this.chunks.splice(0, this.chunkHead);
            this.chunkHead = 0;
          }
        }
      }
      return out;
    }
    // bufferedBytes returns the number of bytes currently buffered.
    bufferedBytes() {
      return this.buffered;
    }
  };

  // node_modules/@floegence/flowersec-core/dist/streamio/index.js
  function abortReasonToError(signal) {
    const r = signal.reason;
    if (r instanceof Error)
      return r;
    if (typeof r === "string" && r !== "")
      return new AbortError(r);
    return new AbortError("aborted");
  }
  function bindAbortToStream(stream, signal) {
    const onAbort = () => {
      try {
        stream.reset(abortReasonToError(signal));
      } catch {
      }
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }
  function createByteReader(stream, opts = {}) {
    if (opts.signal != null)
      bindAbortToStream(stream, opts.signal);
    return new ByteReader(() => stream.read());
  }

  // node_modules/@floegence/flowersec-core/dist/proxy/wsPatch.js
  function readU16be(buf, off) {
    return (buf[off] << 8 | buf[off + 1]) >>> 0;
  }
  var te2 = new TextEncoder();
  var td2 = new TextDecoder();
  function defaultPortForProtocol(protocol) {
    if (protocol === "http:" || protocol === "ws:")
      return "80";
    if (protocol === "https:" || protocol === "wss:")
      return "443";
    return "";
  }
  var ListenerMap = class {
    constructor() {
      __publicField(this, "map", /* @__PURE__ */ new Map());
    }
    on(type, cb) {
      let s = this.map.get(type);
      if (!s) {
        s = /* @__PURE__ */ new Set();
        this.map.set(type, s);
      }
      s.add(cb);
    }
    off(type, cb) {
      this.map.get(type)?.delete(cb);
    }
    emit(type, ev) {
      for (const cb of this.map.get(type) ?? []) {
        try {
          cb.call(null, ev);
        } catch {
        }
      }
    }
  };
  async function writeWSFrame(stream, op, payload, maxPayload) {
    if (maxPayload > 0 && payload.length > maxPayload)
      throw new Error("ws payload too large");
    const hdr = new Uint8Array(5);
    hdr[0] = op & 255;
    hdr.set(u32be(payload.length), 1);
    await stream.write(hdr);
    if (payload.length > 0)
      await stream.write(payload);
  }
  async function readWSFrame(reader, maxPayload) {
    const hdr = await reader.readExactly(5);
    const op = hdr[0];
    const n = readU32be(hdr, 1);
    if (maxPayload > 0 && n > maxPayload)
      throw new Error("ws payload too large");
    const payload = n === 0 ? new Uint8Array() : await reader.readExactly(n);
    return { op, payload };
  }
  function installWebSocketPatch(opts) {
    const Original = globalThis.WebSocket;
    if (Original == null) {
      return { uninstall: () => {
      } };
    }
    const shouldProxy = opts.shouldProxy ?? ((u) => {
      const loc = globalThis.location;
      const hostname = typeof loc?.hostname === "string" ? loc.hostname : "";
      if (hostname === "")
        return false;
      const locProto = typeof loc?.protocol === "string" ? loc.protocol : "";
      const locPortRaw = typeof loc?.port === "string" ? loc.port : "";
      const locPort = locPortRaw !== "" ? locPortRaw : defaultPortForProtocol(locProto);
      const uPort = u.port !== "" ? u.port : defaultPortForProtocol(u.protocol);
      return u.hostname === hostname && uPort === locPort;
    });
    const runtime = opts.runtime;
    const runtimeMaxWsFrameBytes = typeof runtime.limits?.maxWsFrameBytes === "number" && Number.isFinite(runtime.limits.maxWsFrameBytes) ? runtime.limits.maxWsFrameBytes : DEFAULT_MAX_WS_FRAME_BYTES;
    const maxWsFrameBytesRaw = opts.maxWsFrameBytes ?? runtimeMaxWsFrameBytes;
    if (!Number.isFinite(maxWsFrameBytesRaw))
      throw new Error("maxWsFrameBytes must be a finite number");
    const maxWsFrameBytesFloor = Math.floor(maxWsFrameBytesRaw);
    if (maxWsFrameBytesFloor < 0)
      throw new Error("maxWsFrameBytes must be >= 0");
    const maxWsFrameBytes = maxWsFrameBytesFloor === 0 ? runtimeMaxWsFrameBytes : maxWsFrameBytesFloor;
    const _PatchedWebSocket = class _PatchedWebSocket {
      constructor(url, protocols) {
        __publicField(this, "url", "");
        __publicField(this, "readyState", _PatchedWebSocket.CONNECTING);
        __publicField(this, "bufferedAmount", 0);
        __publicField(this, "extensions", "");
        __publicField(this, "protocol", "");
        __publicField(this, "binaryType", "blob");
        __publicField(this, "onopen", null);
        __publicField(this, "onmessage", null);
        __publicField(this, "onerror", null);
        __publicField(this, "onclose", null);
        __publicField(this, "listeners", new ListenerMap());
        __publicField(this, "ac", new AbortController());
        __publicField(this, "stream", null);
        __publicField(this, "readLoopPromise", null);
        __publicField(this, "writeChain", Promise.resolve());
        const u = new URL(String(url), globalThis.location?.href);
        if (!shouldProxy(u)) {
          return new Original(String(url), protocols);
        }
        this.url = u.toString();
        void this.init(u, protocols);
      }
      addEventListener(type, listener) {
        this.listeners.on(type, listener);
      }
      removeEventListener(type, listener) {
        this.listeners.off(type, listener);
      }
      send(data) {
        if (this.readyState !== _PatchedWebSocket.OPEN || this.stream == null) {
          throw new Error("WebSocket is not open");
        }
        const sendBytes = (op, payload) => {
          this.writeChain = this.writeChain.then(() => writeWSFrame(this.stream, op, payload, maxWsFrameBytes)).catch((e) => this.fail(e));
        };
        if (typeof data === "string") {
          sendBytes(1, te2.encode(data));
          return;
        }
        if (data instanceof ArrayBuffer) {
          sendBytes(2, new Uint8Array(data));
          return;
        }
        if (ArrayBuffer.isView(data)) {
          sendBytes(2, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
          return;
        }
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          void data.arrayBuffer().then((ab) => sendBytes(2, new Uint8Array(ab))).catch((e) => this.fail(e));
          return;
        }
        throw new Error("unsupported WebSocket send payload");
      }
      close(code, reason) {
        if (this.readyState === _PatchedWebSocket.CLOSED)
          return;
        this.readyState = _PatchedWebSocket.CLOSING;
        const payloadParts = [];
        if (code != null)
          payloadParts.push(u16be(code));
        if (reason != null && reason !== "")
          payloadParts.push(te2.encode(reason));
        const payload = payloadParts.length === 0 ? new Uint8Array() : payloadParts.reduce((a, b) => {
          const out = new Uint8Array(a.length + b.length);
          out.set(a, 0);
          out.set(b, a.length);
          return out;
        });
        this.writeChain = this.writeChain.then(() => this.stream ? writeWSFrame(this.stream, 8, payload, maxWsFrameBytes) : void 0).catch(() => void 0).finally(() => {
          try {
            this.ac.abort("closed");
          } catch {
          }
        });
      }
      emit(type, ev) {
        const prop = this["on" + type];
        if (typeof prop === "function") {
          try {
            prop.call(this, ev);
          } catch {
          }
        }
        this.listeners.emit(type, ev);
      }
      async init(u, protocols) {
        try {
          const list = typeof protocols === "string" ? [protocols] : Array.isArray(protocols) ? protocols : [];
          const { stream, protocol } = await runtime.openWebSocketStream(u.pathname + u.search, {
            protocols: list,
            signal: this.ac.signal
          });
          this.stream = stream;
          this.protocol = protocol;
          this.readyState = _PatchedWebSocket.OPEN;
          this.emit("open", { type: "open" });
          this.readLoopPromise = this.readLoop(stream, this.ac.signal);
        } catch (e) {
          this.fail(e);
        }
      }
      async readLoop(stream, signal) {
        const reader = createByteReader(stream, { signal });
        try {
          while (true) {
            const { op, payload } = await readWSFrame(reader, maxWsFrameBytes);
            if (op === 9) {
              await writeWSFrame(stream, 10, payload, maxWsFrameBytes);
              continue;
            }
            if (op === 10)
              continue;
            if (op === 8) {
              this.readyState = _PatchedWebSocket.CLOSED;
              const code = payload.length >= 2 ? readU16be(payload, 0) : 1e3;
              const reason = payload.length > 2 ? td2.decode(payload.subarray(2)) : "";
              this.emit("close", { type: "close", code, reason, wasClean: true });
              return;
            }
            if (op === 1) {
              this.emit("message", { type: "message", data: td2.decode(payload) });
              continue;
            }
            if (op === 2) {
              if (this.binaryType === "arraybuffer") {
                const ab2 = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
                this.emit("message", { type: "message", data: ab2 });
                continue;
              }
              if (typeof Blob !== "undefined") {
                this.emit("message", { type: "message", data: new Blob([new Uint8Array(payload)]) });
                continue;
              }
              const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
              this.emit("message", { type: "message", data: ab });
              continue;
            }
          }
        } catch (e) {
          if (this.readyState !== _PatchedWebSocket.CLOSED)
            this.fail(e);
        }
      }
      fail(e) {
        this.readyState = _PatchedWebSocket.CLOSED;
        const msg = e instanceof Error ? e.message : String(e);
        this.emit("error", { type: "error", message: msg });
        this.emit("close", { type: "close", code: 1006, reason: msg, wasClean: false });
        try {
          this.ac.abort(msg);
        } catch {
        }
      }
    };
    __publicField(_PatchedWebSocket, "CONNECTING", 0);
    __publicField(_PatchedWebSocket, "OPEN", 1);
    __publicField(_PatchedWebSocket, "CLOSING", 2);
    __publicField(_PatchedWebSocket, "CLOSED", 3);
    let PatchedWebSocket = _PatchedWebSocket;
    globalThis.WebSocket = PatchedWebSocket;
    return { uninstall: () => globalThis.WebSocket = Original };
  }

  // src/inject.ts
  var RUNTIME_GLOBAL = "__flowersecProxyRuntime";
  var ERR_SW_REGISTER_DISABLED = "service worker register is disabled by flowersec-proxy runtime";
  var CODE_SERVER_WEBVIEW_SW_SUFFIX = "/out/vs/workbench/contrib/webview/browser/pre/service-worker.js";
  var CODE_SERVER_PWA_SW_SUFFIX = "/out/browser/serviceWorker.js";
  function rejectSWRegister() {
    return Promise.reject(new Error(ERR_SW_REGISTER_DISABLED));
  }
  function noopSWRegister(options) {
    let scope = `${window.location.origin}/`;
    try {
      const scopeRaw = String(options?.scope ?? "").trim();
      if (scopeRaw) scope = new URL(scopeRaw, window.location.href).toString();
    } catch {
    }
    const reg = {
      scope,
      update: async () => {
      },
      unregister: async () => true
    };
    return Promise.resolve(reg);
  }
  function patchServiceWorkerRegisterForCodeServer() {
    const sw = globalThis.navigator?.serviceWorker;
    if (!sw || typeof sw.register !== "function") return;
    const current = sw.register;
    if (current.__redeven_sw_patched) return;
    const originalRegister = sw.register.bind(sw);
    const patched = ((scriptURL, options) => {
      try {
        const u = new URL(String(scriptURL), window.location.href);
        if (u.pathname.endsWith(CODE_SERVER_WEBVIEW_SW_SUFFIX)) {
          const scopeRaw = String(options?.scope ?? "").trim();
          if (scopeRaw) {
            const scopeURL = new URL(scopeRaw, window.location.href);
            const dir = u.pathname.slice(0, u.pathname.lastIndexOf("/") + 1);
            if (!scopeURL.pathname.startsWith(dir)) {
              return rejectSWRegister();
            }
          }
          return originalRegister(scriptURL, options);
        }
        if (u.pathname.endsWith(CODE_SERVER_PWA_SW_SUFFIX)) {
          return noopSWRegister(options);
        }
        return rejectSWRegister();
      } catch {
        return rejectSWRegister();
      }
    });
    patched.__redeven_sw_patched = true;
    try {
      sw.register = patched;
    } catch {
    }
  }
  function getProxyRuntime() {
    const top = window.top;
    if (!top) return null;
    const rt = top[RUNTIME_GLOBAL];
    if (!rt) return null;
    return rt;
  }
  try {
    const rt = getProxyRuntime();
    if (rt) {
      patchServiceWorkerRegisterForCodeServer();
      installWebSocketPatch({ runtime: rt });
    }
  } catch {
  }
})();
