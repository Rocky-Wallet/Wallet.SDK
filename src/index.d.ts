export type ChainNamespace = "canton" | "eip155" | "solana" | (string & {});
export type CaipChainId = `${ChainNamespace}:${string}`;
export type CaipAccountId = `${CaipChainId}:${string}`;
export type EvmChainId = `eip155:${string}`;
export type SolanaChainId = `solana:${string}`;

export interface RockyProviderRequest {
  chainId: CaipChainId;
  method: string;
  params?: unknown;
  timeoutMs?: number;
}

export interface UniversalNamespace {
  accounts: CaipAccountId[];
  methods: string[];
  events: string[];
}

export interface RockySessionExtension {
  schemaVersion: 1;
  supportedNamespaces: ChainNamespace[];
  enabledNamespaces: ChainNamespace[];
  primaryAddresses: Partial<Record<ChainNamespace, string>>;
  accountsByChain: Record<CaipChainId, CaipAccountId[]>;
  activeChains?: Partial<Record<ChainNamespace, CaipChainId>>;
}

export interface UniversalSession {
  namespaces: Record<ChainNamespace, UniversalNamespace>;
  rocky: RockySessionExtension;
  account?: Record<string, unknown>;
  connectedSite?: Record<string, unknown>;
}

export interface ConnectRequest {
  name?: string;
  icon?: string;
  requiredNamespaces?: ChainNamespace[];
  timeoutMs?: number;
}

export interface AvailabilityResponse {
  status: "installed" | "notInstalled";
  currentVersion?: string;
  minimalCapableVersion: string;
  isExtensionCapableByVersion: boolean;
}

export interface UniversalRockyProvider {
  readonly isRockyWallet: true;
  readonly version: string;
  connect(request?: ConnectRequest & { universal?: true }): Promise<UniversalSession>;
  disconnect(): Promise<unknown>;
  getSession(options?: { timeoutMs?: number }): Promise<UniversalSession>;
  request(request: RockyProviderRequest): Promise<unknown>;
  on(event: string, listener: (value: unknown) => void): this;
  removeListener(event: string, listener: (value: unknown) => void): this;
}

export interface Eip1193Provider {
  readonly isRockyWallet: true;
  request(request: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (value: unknown) => void): this;
  removeListener(event: string, listener: (value: unknown) => void): this;
}

export interface RockyWalletSdkOptions {
  provider?: UniversalRockyProvider;
  window?: Window;
}

export interface EvmSignMessageRequest {
  chainId: EvmChainId;
  address: string;
  message: string;
  timeoutMs?: number;
}

export interface EvmSignTypedDataRequest {
  chainId: EvmChainId;
  address: string;
  typedData: string | Record<string, unknown>;
  timeoutMs?: number;
}

export interface EvmTransactionRequest {
  chainId: EvmChainId;
  transaction: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SolanaTransactionOptions {
  commitment?: "processed" | "confirmed" | "finalized";
  preflightCommitment?: "processed" | "confirmed" | "finalized";
  skipPreflight?: boolean;
  maxRetries?: number;
  minContextSlot?: number;
}

export interface SolanaSignMessageRequest {
  chainId: SolanaChainId;
  message: Uint8Array | string;
  timeoutMs?: number;
}

export interface SolanaTransactionRequest {
  chainId: SolanaChainId;
  transaction: Uint8Array | string;
  options?: SolanaTransactionOptions;
  timeoutMs?: number;
}

export interface SolanaMessageSignature {
  address: string;
  signature: string;
}

export interface SolanaSignedTransaction {
  signedTransaction: Uint8Array;
}

export interface SolanaTransactionSignature {
  signature: string;
}

export interface RockyWalletSdk {
  checkExtensionAvailability(options?: { timeoutMs?: number }): Promise<AvailabilityResponse>;
  connect(request?: ConnectRequest): Promise<UniversalSession>;
  disconnect(options?: { timeoutMs?: number }): Promise<unknown>;
  getSession(options?: { timeoutMs?: number }): Promise<UniversalSession>;
  request(request: RockyProviderRequest): Promise<unknown>;
  signEvmMessage(request: EvmSignMessageRequest): Promise<string>;
  signEvmTypedData(request: EvmSignTypedDataRequest): Promise<string>;
  sendEvmTransaction(request: EvmTransactionRequest): Promise<string>;
  signSolanaMessage(request: SolanaSignMessageRequest): Promise<SolanaMessageSignature>;
  signSolanaTransaction(request: SolanaTransactionRequest): Promise<SolanaSignedTransaction>;
  signAndSendSolanaTransaction(request: SolanaTransactionRequest): Promise<SolanaTransactionSignature>;
  getWalletVersion(options?: { timeoutMs?: number }): Promise<string>;
  getEthereumProvider(options?: { timeoutMs?: number }): Promise<Eip1193Provider>;
  on(event: string, listener: (value: unknown) => void, options?: { timeoutMs?: number }): Promise<() => void>;
}

export declare class RockyWalletError extends Error {
  code: number;
  data?: unknown;
  constructor(message: string, options?: { code?: number; data?: unknown });
}

export declare const MINIMAL_CAPABLE_VERSION = "1.1.0";
export declare const ROCKY_WALLET_INITIALIZED_EVENT = "rockyWallet#initialized";
export declare function createRockyWalletSdk(options?: RockyWalletSdkOptions): RockyWalletSdk;
export declare const rockyWallet: RockyWalletSdk;
export default rockyWallet;

declare global {
  interface Window {
    rockyWallet?: UniversalRockyProvider;
    ethereum?: Eip1193Provider;
  }
}
