import { Address, beginCell, Dictionary, storeStateInit, toNano } from '@ton/core';
import { Buffer } from 'buffer';

import { PixelBoard } from '../../wrappers-ts/PixelBoard.gen';

export type Network = 'testnet' | 'mainnet';

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
export const OWNER_SHARE_TON = '0.01';
export const DEPLOY_VALUE_TON = '0.5';

const TX_TTL_SECONDS = 300;
const DEFAULT_WIDTH = BigInt(BOARD_WIDTH);
const DEFAULT_HEIGHT = BigInt(BOARD_HEIGHT);
const PIXEL_PRICE = toNano(PIXEL_PRICE_TON);
const DEPLOY_VALUE = toNano(DEPLOY_VALUE_TON);
const ADMIN_MESSAGE_VALUE = toNano('0.03');

export const BASE_PIXEL_PRICE_NANO = PIXEL_PRICE;

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

export function createBoardDeployment(
  ownerAddress: string,
  payoutWalletAddress: string,
  network: Network,
) {
  const owner = parseAddress(ownerAddress, 'Owner wallet');
  const payoutWallet = parseAddress(payoutWalletAddress, 'Payout wallet');
  const board = PixelBoard.fromStorage({
    owner,
    payoutWallet,
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
