import { Address, beginCell, Dictionary, storeStateInit, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { Buffer } from 'buffer';

import { PixelBoard } from '../../wrappers-ts/PixelBoard.gen';

export type Network = 'testnet' | 'mainnet';

export type BoardPixel = {
  index: number;
  x: number;
  y: number;
  imageUrl: string;
  imageKind: number;
  painter: string;
  updatedAt: number;
  pricePaidNano: bigint;
  nextPriceNano: bigint;
};

export type BoardSnapshot = {
  owner: string;
  payoutWallet: string;
  width: number;
  height: number;
  basePriceNano: bigint;
  isPaused: boolean;
  placedCount: number;
  pixels: BoardPixel[];
};

export type TonConnectTransaction = {
  validUntil: number;
  messages: Array<{
    address: string;
    amount: string;
    payload?: string;
    stateInit?: string;
  }>;
};

export const BOARD_WIDTH = 32;
export const BOARD_HEIGHT = 32;
export const PIXEL_PRICE_TON = '0.02';
export const GAS_BUFFER_TON = '0.03';
export const DEPLOY_VALUE_TON = '0.5';
export const MAX_BOARD_SEED = 4_294_967_295;

const TX_TTL_SECONDS = 300;
const DEFAULT_WIDTH = BigInt(BOARD_WIDTH);
const DEFAULT_HEIGHT = BigInt(BOARD_HEIGHT);
const PIXEL_PRICE = toNano(PIXEL_PRICE_TON);
const GAS_BUFFER = toNano(GAS_BUFFER_TON);
const DEPLOY_VALUE = toNano(DEPLOY_VALUE_TON);
const ADMIN_MESSAGE_VALUE = toNano('0.03');

export const BASE_PIXEL_PRICE_NANO = PIXEL_PRICE;
export const GAS_BUFFER_NANO = GAS_BUFFER;

export function attachedValueForPrice(priceNano: bigint): bigint {
  return priceNano + GAS_BUFFER;
}

function validUntil(): number {
  return Math.floor(Date.now() / 1000) + TX_TTL_SECONDS;
}

function formatAddress(address: Address, network: Network): string {
  return address.toString({
    bounceable: true,
    testOnly: network === 'testnet',
  });
}

function cellToBase64(cell: { toBoc(): Uint8Array }): string {
  return Buffer.from(cell.toBoc()).toString('base64');
}

function makeTransaction(messages: TonConnectTransaction['messages']): TonConnectTransaction {
  return {
    validUntil: validUntil(),
    messages,
  };
}

function parseAddress(value: string, fieldName: string): Address {
  try {
    return Address.parse(value);
  } catch {
    throw new Error(`${fieldName} is not a valid TON address`);
  }
}

function parseBoardSeed(seedValue: string): bigint {
  const trimmed = seedValue.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Board seed must be a non-negative integer');
  }
  const seed = BigInt(trimmed);
  if (seed > BigInt(MAX_BOARD_SEED)) {
    throw new Error(`Board seed must be <= ${MAX_BOARD_SEED}`);
  }
  return seed;
}

export function createRandomBoardSeed(): string {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0].toString();
  }
  return (Date.now() >>> 0).toString();
}

export function createBoardDeployment(
  ownerAddress: string,
  payoutWalletAddress: string,
  network: Network,
  seedValue: string,
) {
  const owner = parseAddress(ownerAddress, 'Owner wallet');
  const payoutWallet = parseAddress(payoutWalletAddress, 'Payout wallet');
  const seed = parseBoardSeed(seedValue);
  const board = PixelBoard.fromStorage({
    owner,
    payoutWallet,
    seed,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    price: PIXEL_PRICE,
    isPaused: false,
    placedCount: 0n,
    pixels: Dictionary.empty(),
  });

  if (!board.init) {
    throw new Error('Unable to create PixelBoard state init');
  }

  const stateInit = beginCell().store(storeStateInit(board.init)).endCell();
  const address = formatAddress(board.address, network);

  return {
    address,
    transaction: makeTransaction([
      {
        address,
        amount: DEPLOY_VALUE.toString(),
        stateInit: cellToBase64(stateInit),
      },
    ]),
  };
}

export function normalizeImageUrl(imageUrl: string): string {
  const trimmed = imageUrl.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Image URL must be absolute');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Image URL must use http or https');
  }
  if (!/\.(jpe?g|png|webp)(\?.*)?$/i.test(url.href)) {
    throw new Error('Image URL must end with jpg, jpeg, png, or webp');
  }
  if (url.href.length > 240) {
    throw new Error('Image URL is too long');
  }
  return url.href;
}

function toncenterEndpoint(network: Network): string {
  return network === 'testnet'
    ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
    : 'https://toncenter.com/api/v2/jsonRPC';
}

function toncenterApiKey(network: Network): string | undefined {
  return network === 'testnet'
    ? import.meta.env.VITE_TONCENTER_TESTNET_API_KEY
    : import.meta.env.VITE_TONCENTER_MAINNET_API_KEY;
}

export async function fetchBoardSnapshot(boardAddress: string, network: Network): Promise<BoardSnapshot> {
  const address = parseAddress(boardAddress, 'Board address');
  const client = new TonClient({
    endpoint: toncenterEndpoint(network),
    apiKey: toncenterApiKey(network),
    timeout: 10000,
  });
  const board = client.open(PixelBoard.fromAddress(address));
  const [owner, payoutWallet, width, height, basePrice, isPaused, placedCount] =
    await board.getConfig();
  const pixels = await board.getPixels();
  const widthNumber = Number(width);

  return {
    owner: formatAddress(owner, network),
    payoutWallet: formatAddress(payoutWallet, network),
    width: widthNumber,
    height: Number(height),
    basePriceNano: basePrice,
    isPaused,
    placedCount: Number(placedCount),
    pixels: pixels
      .keys()
      .map((key) => {
        const pixel = pixels.get(key);
        if (!pixel) {
          return null;
        }
        const index = Number(key);
        return {
          index,
          x: index % widthNumber,
          y: Math.floor(index / widthNumber),
          imageUrl: pixel.imageUrl,
          imageKind: Number(pixel.imageKind),
          painter: formatAddress(pixel.painter, network),
          updatedAt: Number(pixel.updatedAt),
          pricePaidNano: pixel.pricePaid,
          nextPriceNano: pixel.pricePaid * 2n,
        };
      })
      .filter((pixel): pixel is BoardPixel => pixel !== null)
      .sort((a, b) => a.index - b.index),
  };
}

function imageKindFromUrl(imageUrl: string): 'jpg' | 'png' | 'webp' {
  const path = new URL(imageUrl).pathname.toLowerCase();
  if (path.endsWith('.png')) {
    return 'png';
  }
  if (path.endsWith('.webp')) {
    return 'webp';
  }
  return 'jpg';
}

function hexCoord(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function createImageComment(x: number, y: number, imageUrl: string): string {
  const url = normalizeImageUrl(imageUrl);
  return `pb:${hexCoord(x)}${hexCoord(y)}:${imageKindFromUrl(url)}:${url}`;
}

export function createPlaceImageTransaction(
  boardAddress: string,
  x: number,
  y: number,
  imageUrl: string,
  amountNano: bigint,
  network: Network,
): TonConnectTransaction {
  if (!Number.isInteger(x) || x < 0 || x >= BOARD_WIDTH) {
    throw new Error(`x must be from 0 to ${BOARD_WIDTH - 1}`);
  }
  if (!Number.isInteger(y) || y < 0 || y >= BOARD_HEIGHT) {
    throw new Error(`y must be from 0 to ${BOARD_HEIGHT - 1}`);
  }

  const board = parseAddress(boardAddress, 'Board address');
  const comment = createImageComment(x, y, imageUrl);
  const payload = beginCell().storeUint(0, 32).storeStringTail(comment).endCell();

  return makeTransaction([
    {
      address: formatAddress(board, network),
      amount: amountNano.toString(),
      payload: cellToBase64(payload),
    },
  ]);
}

export function createSetPausedTransaction(
  boardAddress: string,
  isPaused: boolean,
  network: Network,
): TonConnectTransaction {
  const board = parseAddress(boardAddress, 'Board address');
  const payload = PixelBoard.createCellOfSetPaused({ isPaused });

  return makeTransaction([
    {
      address: formatAddress(board, network),
      amount: ADMIN_MESSAGE_VALUE.toString(),
      payload: cellToBase64(payload),
    },
  ]);
}

export function createSetPriceTransaction(
  boardAddress: string,
  priceTon: string,
  network: Network,
): TonConnectTransaction {
  const board = parseAddress(boardAddress, 'Board address');
  const price = toNano(priceTon);
  if (price <= 0n) {
    throw new Error('Price must be positive');
  }
  const payload = PixelBoard.createCellOfSetPrice({ price });

  return makeTransaction([
    {
      address: formatAddress(board, network),
      amount: ADMIN_MESSAGE_VALUE.toString(),
      payload: cellToBase64(payload),
    },
  ]);
}

export function createSetPayoutWalletTransaction(
  boardAddress: string,
  payoutWalletAddress: string,
  network: Network,
): TonConnectTransaction {
  const board = parseAddress(boardAddress, 'Board address');
  const payoutWallet = parseAddress(payoutWalletAddress, 'Payout wallet');
  const payload = PixelBoard.createCellOfSetPayoutWallet({ payoutWallet });

  return makeTransaction([
    {
      address: formatAddress(board, network),
      amount: ADMIN_MESSAGE_VALUE.toString(),
      payload: cellToBase64(payload),
    },
  ]);
}
