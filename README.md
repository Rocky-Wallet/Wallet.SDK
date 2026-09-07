# Rocky Wallet DApp SDK

Rocky Wallet SDK 1.1 exposes one chain-agnostic provider for Canton, EVM, and future
namespaces. Requests use CAIP-2 chain identifiers and never accept wallet secrets.

## Install

```bash
npm install @rocky-wallet/dapp-sdk
```

## Connect Once

```ts
import { rockyWallet } from "@rocky-wallet/dapp-sdk";

const session = await rockyWallet.connect({ name: "Rocky Bridge" });

console.log(session.namespaces);
console.log(session.rocky.primaryAddresses);
console.log(session.rocky.accountsByChain);
```

The connection approval includes every currently enabled namespace in the active Rocky
profile. The returned permission is an origin-scoped snapshot. New chains or accounts are
not exposed until the dApp reconnects or explicitly requests an approved custom EVM chain.

## Universal Requests

Every request must include an explicit CAIP-2 `chainId`:

```ts
const balance = await rockyWallet.request({
  chainId: "eip155:1",
  method: "eth_getBalance",
  params: [session.rocky.primaryAddresses.eip155, "latest"],
});

const signature = await rockyWallet.request({
  chainId: "canton:production",
  method: "canton_signMessage",
  params: [{ message: "Bridge authorization" }],
});
```

Supported namespace names follow chain-agnostic standards: `eip155`, `canton`, and later
namespaces such as `solana`. Aliases such as `evm` and `sol` are not used.

## Typed signing helpers

The typed helpers keep the CAIP-2 chain explicit and route every approval through the
extension. Private keys and recovery phrases never enter the SDK.

```ts
const evmSignature = await rockyWallet.signEvmMessage({
  chainId: "eip155:1",
  address: session.rocky.primaryAddresses.eip155!,
  message: "Sign in to Rocky",
});

const typedSignature = await rockyWallet.signEvmTypedData({
  chainId: "eip155:1",
  address: session.rocky.primaryAddresses.eip155!,
  typedData,
});

const transactionHash = await rockyWallet.sendEvmTransaction({
  chainId: "eip155:1",
  transaction: { from, to, value: "0x16345785d8a0000" },
});
```

Solana transaction helpers accept serialized wire bytes as `Uint8Array` (or a base64
string). `signSolanaTransaction` returns signed wire bytes without broadcasting;
`signAndSendSolanaTransaction` submits the exact approved transaction.

```ts
const messageResult = await rockyWallet.signSolanaMessage({
  chainId: "solana:mainnet",
  message: new TextEncoder().encode("Sign in to Rocky"),
});

const { signedTransaction } = await rockyWallet.signSolanaTransaction({
  chainId: "solana:mainnet",
  transaction: serializedTransaction,
});

const { signature } = await rockyWallet.signAndSendSolanaTransaction({
  chainId: "solana:mainnet",
  transaction: serializedTransaction,
  options: { commitment: "confirmed", skipPreflight: false },
});
```

Supported signing methods are `personal_sign`, `eth_signTypedData_v4`, and
`eth_sendTransaction` for EVM; and `solana_signMessage`, `solana_signTransaction`, and
`solana_signAndSendTransaction` for Solana. All signing and write methods require an
explicit wallet confirmation.

## EIP-1193

The extension also publishes a standard EVM view at `window.ethereum` and through EIP-6963.
The SDK can return Rocky's injected view:

```ts
const ethereum = await rockyWallet.getEthereumProvider();
const accounts = await ethereum.request({ method: "eth_requestAccounts" });
```

Use EIP-6963 discovery when multiple browser wallets may be installed.

## Session Shape

```json
{
  "namespaces": {
    "eip155": {
      "accounts": ["eip155:1:0x1234..."],
      "methods": ["eth_requestAccounts", "personal_sign", "eth_sendTransaction"],
      "events": ["accountsChanged", "chainChanged"]
    },
    "canton": {
      "accounts": ["canton:production:party%3A%3A1220..."],
      "methods": ["canton_signMessage"],
      "events": ["accountsChanged"]
    },
    "solana": {
      "accounts": ["solana:mainnet:9xQe..."],
      "methods": ["solana_signMessage", "solana_signTransaction", "solana_signAndSendTransaction"],
      "events": ["accountsChanged"]
    }
  },
  "rocky": {
    "schemaVersion": 1,
    "supportedNamespaces": ["canton", "eip155", "solana"],
    "enabledNamespaces": ["canton", "eip155", "solana"],
    "primaryAddresses": {
      "canton": "party::1220...",
      "eip155": "0x1234...",
      "solana": "9xQe..."
    },
    "accountsByChain": {
      "canton:production": ["canton:production:party%3A%3A1220..."],
      "eip155:1": ["eip155:1:0x1234..."],
      "solana:mainnet": ["solana:mainnet:9xQe..."]
    }
  }
}
```

Unavailable namespaces are omitted. Empty addresses are never returned.

## Security Contract

- Signing stays inside the Rocky Wallet extension.
- Signing and write requests always require wallet confirmation.
- The SDK rejects mnemonic, recovery phrase, seed, private key, password, xprv, WIF, and
  keystore fields.
- Legacy Ed25519-private-key-only Rocky profiles are Canton-only. EVM requires importing
  the original BIP39 recovery phrase into a multichain profile.

SDK 1.1 is intentionally incompatible with the Canton-only 1.0 API. It requires Rocky
Wallet Extension 1.1 or newer.
