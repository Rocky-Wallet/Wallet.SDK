export const MINIMAL_CAPABLE_VERSION = "1.1.0";
export const ROCKY_WALLET_INITIALIZED_EVENT = "rockyWallet#initialized";

const DEFAULT_TIMEOUT_MS = 1500;
const SECRET_KEY_PATTERN = /^(?:mnemonic|seed(?:phrase)?|recovery(?:phrase)?|privatekey(?:hex)?|walletpassword|xprv|wif|keystore)$/iu;

export class RockyWalletError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "RockyWalletError";
    this.code = options.code ?? 4900;
    if (options.data !== undefined) this.data = options.data;
  }
}

export function createRockyWalletSdk(options = {}) {
  const injectedProvider = options.provider;
  const injectedWindow = options.window;

  async function getProvider(callOptions = {}) {
    assertNoWalletSecrets(callOptions);
    if (injectedProvider) return injectedProvider;
    return resolveInjectedProvider(injectedWindow || globalThis.window, callOptions.timeoutMs);
  }

  async function universalRequest(request) {
    assertUniversalRequest(request);
    assertNoWalletSecrets(request);
    const provider = await getProvider(request);
    if (typeof provider.request !== "function") {
      throw new RockyWalletError("Rocky Wallet provider does not support universal requests", { code: 4200 });
    }
    try {
      return await provider.request(request);
    } catch (error) {
      throw toRockyWalletError(error);
    }
  }

  return Object.freeze({
    async checkExtensionAvailability(callOptions = {}) {
      try {
        const provider = await getProvider(callOptions);
        const currentVersion = providerVersion(provider);
        return {
          status: "installed",
          currentVersion,
          minimalCapableVersion: MINIMAL_CAPABLE_VERSION,
          isExtensionCapableByVersion: compareVersions(currentVersion, MINIMAL_CAPABLE_VERSION),
        };
      } catch (error) {
        const normalized = toRockyWalletError(error);
        if (normalized.code === -32602) throw normalized;
        return {
          status: "notInstalled",
          minimalCapableVersion: MINIMAL_CAPABLE_VERSION,
          isExtensionCapableByVersion: false,
        };
      }
    },

    async connect(request = {}) {
      assertNoWalletSecrets(request);
      const provider = await getProvider(request);
      if (typeof provider.connect !== "function") {
        throw new RockyWalletError("Rocky Wallet provider does not support universal connect", { code: 4200 });
      }
      const session = await callProvider(provider, "connect", { ...request, universal: true });
      return validateUniversalSession(session);
    },

    async disconnect(callOptions = {}) {
      const provider = await getProvider(callOptions);
      if (typeof provider.disconnect !== "function") return { status: true };
      return callProvider(provider, "disconnect");
    },

    async getSession(callOptions = {}) {
      const provider = await getProvider(callOptions);
      if (typeof provider.getSession !== "function") {
        throw new RockyWalletError("Rocky Wallet provider does not support session snapshots", { code: 4200 });
      }
      return validateUniversalSession(await callProvider(provider, "getSession", callOptions));
    },

    request: universalRequest,

    async signEvmMessage({ chainId, address, message, timeoutMs } = {}) {
      assertChainNamespace(chainId, "eip155");
      if (typeof message !== "string") throw invalidParams("message must be a string");
      if (typeof address !== "string" || !address.trim()) throw invalidParams("address is required");
      return universalRequest({
        chainId,
        method: "personal_sign",
        params: [message, address],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    },

    async signEvmTypedData({ chainId, address, typedData, timeoutMs } = {}) {
      assertChainNamespace(chainId, "eip155");
      if (typeof address !== "string" || !address.trim()) throw invalidParams("address is required");
      if (typeof typedData !== "string" && (!typedData || typeof typedData !== "object")) {
        throw invalidParams("typedData must be an object or JSON string");
      }
      return universalRequest({
        chainId,
        method: "eth_signTypedData_v4",
        params: [address, typeof typedData === "string" ? typedData : JSON.stringify(typedData)],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    },

    async sendEvmTransaction({ chainId, transaction, timeoutMs } = {}) {
      assertChainNamespace(chainId, "eip155");
      if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
        throw invalidParams("transaction must be an object");
      }
      return universalRequest({
        chainId,
        method: "eth_sendTransaction",
        params: [transaction],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    },

    async signSolanaMessage({ chainId, message, timeoutMs } = {}) {
      assertChainNamespace(chainId, "solana");
      const input = typeof message === "string"
        ? { message }
        : { message: bytesToBase64(message, "message"), encoding: "base64" };
      return universalRequest({
        chainId,
        method: "solana_signMessage",
        params: [input],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    },

    async signSolanaTransaction({ chainId, transaction, options = {}, timeoutMs } = {}) {
      assertChainNamespace(chainId, "solana");
      const result = await universalRequest({
        chainId,
        method: "solana_signTransaction",
        params: [{ transaction: bytesToBase64(transaction, "transaction"), encoding: "base64", options }],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
      return {
        ...result,
        signedTransaction: base64ToBytes(result?.signedTransaction, "signed transaction"),
      };
    },

    async signAndSendSolanaTransaction({ chainId, transaction, options = {}, timeoutMs } = {}) {
      assertChainNamespace(chainId, "solana");
      return universalRequest({
        chainId,
        method: "solana_signAndSendTransaction",
        params: [{ transaction: bytesToBase64(transaction, "transaction"), encoding: "base64", options }],
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      });
    },

    async getWalletVersion(callOptions = {}) {
      return providerVersion(await getProvider(callOptions));
    },

    async getEthereumProvider(callOptions = {}) {
      await getProvider(callOptions);
      const win = injectedWindow || globalThis.window;
      const provider = win?.ethereum;
      if (!provider?.isRockyWallet || typeof provider.request !== "function") {
        throw new RockyWalletError("Rocky Wallet EIP-1193 provider is unavailable", { code: 4900 });
      }
      return provider;
    },

    async on(event, listener, callOptions = {}) {
      if (typeof listener !== "function") throw new RockyWalletError("listener must be a function", { code: -32602 });
      const provider = await getProvider(callOptions);
      if (typeof provider.on !== "function") throw new RockyWalletError("Provider events are unavailable", { code: 4200 });
      provider.on(event, listener);
      return () => provider.removeListener?.(event, listener);
    },
  });
}

function invalidParams(message) {
  return new RockyWalletError(message, { code: -32602 });
}

function assertChainNamespace(chainId, namespace) {
  if (typeof chainId !== "string" || !chainId.startsWith(`${namespace}:`)) {
    throw invalidParams(`chainId must use the ${namespace} namespace`);
  }
}

function bytesToBase64(value, label) {
  if (typeof value === "string") {
    if (!isBase64(value)) throw invalidParams(`${label} must be Uint8Array or valid base64`);
    return value;
  }
  if (!(value instanceof Uint8Array)) throw invalidParams(`${label} must be Uint8Array or valid base64`);
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value, label) {
  if (!isBase64(value)) {
    throw new RockyWalletError(`Rocky Wallet returned an invalid ${label}`, { code: -32603 });
  }
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function isBase64(value) {
  return typeof value === "string"
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}

function validateUniversalSession(value) {
  if (!value || typeof value !== "object" || !value.namespaces || value.rocky?.schemaVersion !== 1) {
    throw new RockyWalletError("Rocky Wallet returned an invalid universal session", { code: -32603 });
  }
  return value;
}

function assertUniversalRequest(value) {
  if (!value || typeof value !== "object") {
    throw new RockyWalletError("request must be an object", { code: -32602 });
  }
  if (!/^[a-z0-9-]+:[A-Za-z0-9._-]+$/u.test(String(value.chainId || ""))) {
    throw new RockyWalletError("request.chainId must be an explicit CAIP-2 chain id", { code: -32602 });
  }
  if (typeof value.method !== "string" || !value.method) {
    throw new RockyWalletError("request.method is required", { code: -32602 });
  }
}

function assertNoWalletSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key.replace(/[-_\s]/gu, ""))) {
      throw new RockyWalletError(`Wallet secret field is not allowed in the dApp SDK: ${key}`, { code: -32602 });
    }
    assertNoWalletSecrets(nested, seen);
  }
}

async function callProvider(provider, method, params) {
  try {
    return await provider[method](params);
  } catch (error) {
    throw toRockyWalletError(error);
  }
}

function resolveInjectedProvider(win, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (win?.rockyWallet) return Promise.resolve(win.rockyWallet);
  if (!win?.addEventListener) {
    return Promise.reject(new RockyWalletError("Rocky Wallet extension is not installed", { code: 4900 }));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      win.removeEventListener?.(ROCKY_WALLET_INITIALIZED_EVENT, onInitialized);
    };
    const onInitialized = () => {
      if (!win.rockyWallet) return;
      cleanup();
      resolve(win.rockyWallet);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new RockyWalletError("Rocky Wallet extension is not installed", { code: 4900 }));
    }, Math.max(0, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    win.addEventListener(ROCKY_WALLET_INITIALIZED_EVENT, onInitialized);
  });
}

function providerVersion(provider) {
  const version = String(provider?.version || "0.0.0");
  return /^\d+\.\d+\.\d+$/u.test(version) ? version : "0.0.0";
}

function compareVersions(current, minimum) {
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

function toRockyWalletError(error) {
  if (error instanceof RockyWalletError) return error;
  return new RockyWalletError(error?.message || "Rocky Wallet request failed", {
    code: Number.isInteger(error?.code) ? error.code : 4900,
    data: error?.data,
  });
}

export const rockyWallet = createRockyWalletSdk();
export default rockyWallet;
