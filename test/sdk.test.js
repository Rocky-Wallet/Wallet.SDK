import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MINIMAL_CAPABLE_VERSION,
  RockyWalletError,
  createRockyWalletSdk,
} from "../src/index.js";

const SESSION = Object.freeze({
  namespaces: {
    canton: {
      accounts: ["canton:production:party%3A%3A1220abc"],
      methods: ["canton_signMessage"],
      events: ["accountsChanged"],
    },
    eip155: {
      accounts: ["eip155:1:0x1234"],
      methods: ["personal_sign", "eth_signTypedData_v4", "eth_sendTransaction"],
      events: ["accountsChanged", "chainChanged"],
    },
    solana: {
      accounts: ["solana:mainnet:9xQeWvG816bUx9EPfEZ2s4Q8VhSm7GgJ8JsEdQANZP7S"],
      methods: ["solana_signMessage", "solana_signTransaction", "solana_signAndSendTransaction"],
      events: ["accountsChanged"],
    },
  },
  rocky: {
    schemaVersion: 1,
    supportedNamespaces: ["canton", "eip155", "solana"],
    enabledNamespaces: ["canton", "eip155", "solana"],
    primaryAddresses: {
      canton: "party::1220abc",
      eip155: "0x1234",
      solana: "9xQeWvG816bUx9EPfEZ2s4Q8VhSm7GgJ8JsEdQANZP7S",
    },
    accountsByChain: {
      "canton:production": ["canton:production:party%3A%3A1220abc"],
      "eip155:1": ["eip155:1:0x1234"],
      "solana:mainnet": ["solana:mainnet:9xQeWvG816bUx9EPfEZ2s4Q8VhSm7GgJ8JsEdQANZP7S"],
    },
  },
});

test("SDK 1.1 connects once and preserves the universal session", async () => {
  const calls = [];
  const provider = providerStub({
    async connect(request) {
      calls.push(request);
      return SESSION;
    },
  });
  const sdk = createRockyWalletSdk({ provider });

  assert.deepEqual(await sdk.connect({ name: "Bridge dApp" }), SESSION);
  assert.deepEqual(calls, [{ name: "Bridge dApp", universal: true }]);
});

test("universal requests require an explicit CAIP-2 chain id", async () => {
  const sdk = createRockyWalletSdk({ provider: providerStub() });

  await assert.rejects(
    () => sdk.request({ method: "eth_chainId" }),
    (error) => error instanceof RockyWalletError && error.code === -32602,
  );
  assert.equal(await sdk.request({ chainId: "eip155:1", method: "eth_chainId" }), "0x1");
});

test("provider errors retain EIP-1193 codes and data", async () => {
  const provider = providerStub({
    async request() {
      const error = new Error("unauthorized");
      error.code = 4100;
      error.data = { origin: "https://bridge.example" };
      throw error;
    },
  });
  const sdk = createRockyWalletSdk({ provider });

  await assert.rejects(
    () => sdk.request({ chainId: "eip155:1", method: "eth_accounts" }),
    (error) => error.code === 4100 && error.data.origin === "https://bridge.example",
  );
});

test("typed EVM signing helpers route exact wallet methods and parameters", async () => {
  const calls = [];
  const provider = providerStub({
    async request(request) {
      calls.push(request);
      if (request.method === "eth_sendTransaction") return "0xtransaction";
      return "0xsignature";
    },
  });
  const sdk = createRockyWalletSdk({ provider });
  const typedData = {
    domain: { name: "Rocky" },
    types: { Message: [{ name: "contents", type: "string" }] },
    primaryType: "Message",
    message: { contents: "Hello" },
  };

  assert.equal(await sdk.signEvmMessage({ chainId: "eip155:1", address: "0x1234", message: "hello" }), "0xsignature");
  assert.equal(await sdk.signEvmTypedData({ chainId: "eip155:1", address: "0x1234", typedData }), "0xsignature");
  assert.equal(await sdk.sendEvmTransaction({ chainId: "eip155:1", transaction: { from: "0x1234", to: "0xabcd", value: "0x1" } }), "0xtransaction");
  assert.deepEqual(calls, [
    { chainId: "eip155:1", method: "personal_sign", params: ["hello", "0x1234"] },
    { chainId: "eip155:1", method: "eth_signTypedData_v4", params: ["0x1234", JSON.stringify(typedData)] },
    { chainId: "eip155:1", method: "eth_sendTransaction", params: [{ from: "0x1234", to: "0xabcd", value: "0x1" }] },
  ]);
});

test("typed Solana signing helpers encode wire bytes and decode signed transactions", async () => {
  const calls = [];
  const provider = providerStub({
    async request(request) {
      calls.push(request);
      if (request.method === "solana_signMessage") return { address: "sol-address", signature: "base58-signature" };
      if (request.method === "solana_signTransaction") return { signedTransaction: "BAUG" };
      return { signature: "transaction-signature" };
    },
  });
  const sdk = createRockyWalletSdk({ provider });

  assert.deepEqual(
    await sdk.signSolanaMessage({ chainId: "solana:mainnet", message: new Uint8Array([1, 2, 3]) }),
    { address: "sol-address", signature: "base58-signature" },
  );
  assert.deepEqual(
    await sdk.signSolanaTransaction({ chainId: "solana:mainnet", transaction: new Uint8Array([4, 5, 6]) }),
    { signedTransaction: new Uint8Array([4, 5, 6]) },
  );
  assert.deepEqual(
    await sdk.signAndSendSolanaTransaction({
      chainId: "solana:mainnet",
      transaction: new Uint8Array([7, 8, 9]),
      options: { commitment: "confirmed", skipPreflight: true },
    }),
    { signature: "transaction-signature" },
  );
  assert.deepEqual(calls, [
    { chainId: "solana:mainnet", method: "solana_signMessage", params: [{ message: "AQID", encoding: "base64" }] },
    { chainId: "solana:mainnet", method: "solana_signTransaction", params: [{ transaction: "BAUG", encoding: "base64", options: {} }] },
    { chainId: "solana:mainnet", method: "solana_signAndSendTransaction", params: [{ transaction: "BwgJ", encoding: "base64", options: { commitment: "confirmed", skipPreflight: true } }] },
  ]);
});

test("typed signing helpers reject the wrong chain namespace before provider calls", async () => {
  let calls = 0;
  const sdk = createRockyWalletSdk({ provider: providerStub({ async request() { calls += 1; } }) });

  await assert.rejects(
    sdk.signEvmMessage({ chainId: "solana:mainnet", address: "0x1234", message: "hello" }),
    (error) => error.code === -32602,
  );
  await assert.rejects(
    sdk.signSolanaTransaction({ chainId: "eip155:1", transaction: new Uint8Array([1]) }),
    (error) => error.code === -32602,
  );
  assert.equal(calls, 0);
});

test("SDK rejects wallet secret fields before calling the provider", async () => {
  let called = false;
  const provider = providerStub({
    async request() {
      called = true;
    },
  });
  const sdk = createRockyWalletSdk({ provider });

  await assert.rejects(
    () => sdk.request({ chainId: "eip155:1", method: "personal_sign", params: [{ private_key: "secret" }] }),
    (error) => error.code === -32602,
  );
  assert.equal(called, false);
});

test("availability requires Extension 1.1 or newer", async () => {
  assert.equal(MINIMAL_CAPABLE_VERSION, "1.1.0");
  const current = createRockyWalletSdk({ provider: providerStub({ version: "1.1.0" }) });
  const old = createRockyWalletSdk({ provider: providerStub({ version: "1.0.6" }) });

  assert.equal((await current.checkExtensionAvailability()).isExtensionCapableByVersion, true);
  assert.equal((await old.checkExtensionAvailability()).isExtensionCapableByVersion, false);
});

test("SDK waits for delayed provider injection", async () => {
  const listeners = new Map();
  const window = {
    addEventListener(event, listener) {
      listeners.set(event, listener);
    },
    removeEventListener(event) {
      listeners.delete(event);
    },
  };
  const sdk = createRockyWalletSdk({ window });
  const pending = sdk.checkExtensionAvailability({ timeoutMs: 100 });
  window.rockyWallet = providerStub();
  listeners.get("rockyWallet#initialized")();

  assert.equal((await pending).status, "installed");
});

test("getEthereumProvider returns only Rocky's EIP-1193 view", async () => {
  const ethereum = { isRockyWallet: true, request() {} };
  const window = { rockyWallet: providerStub(), ethereum };
  const sdk = createRockyWalletSdk({ window });

  assert.equal(await sdk.getEthereumProvider(), ethereum);
});

test("event subscription returns an unsubscribe callback", async () => {
  const listeners = new Map();
  const provider = providerStub({
    on(event, listener) {
      listeners.set(event, listener);
      return this;
    },
    removeListener(event, listener) {
      if (listeners.get(event) === listener) listeners.delete(event);
      return this;
    },
  });
  const sdk = createRockyWalletSdk({ provider });
  const listener = () => {};
  const unsubscribe = await sdk.on("accountsChanged", listener);

  assert.equal(listeners.get("accountsChanged"), listener);
  unsubscribe();
  assert.equal(listeners.has("accountsChanged"), false);
});

function providerStub(overrides = {}) {
  return {
    isRockyWallet: true,
    version: "1.1.0",
    async connect() {
      return SESSION;
    },
    async disconnect() {
      return { status: true };
    },
    async getSession() {
      return SESSION;
    },
    async request(request) {
      return request.method === "eth_chainId" ? "0x1" : null;
    },
    on() {
      return this;
    },
    removeListener() {
      return this;
    },
    ...overrides,
  };
}
