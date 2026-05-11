import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  CircleDollarSign,
  Eraser,
  Grid3X3,
  ImagePlus,
  Pause,
  Play,
  RefreshCw,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

import {
  BASE_PIXEL_PRICE_NANO,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DEPLOY_VALUE_TON,
  GAS_BUFFER_TON,
  type Network,
  attachedValueForPrice,
  createBoardDeployment,
  createRandomBoardSeed,
  createPlaceImageTransaction,
  createSetPausedTransaction,
  createSetPayoutWalletTransaction,
  createSetPriceTransaction,
  fetchBoardSnapshot,
  normalizeImageUrl,
} from './lib/pixelBoard';

type PixelCell = {
  imageUrl: string;
  pricePaidNano: bigint;
  nextPriceNano: bigint;
  pending: boolean;
};

function createEmptyGrid(): PixelCell[] {
  return Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, () => ({
    imageUrl: '',
    pricePaidNano: 0n,
    nextPriceNano: BASE_PIXEL_PRICE_NANO,
    pending: false,
  }));
}

function loadGrid(): PixelCell[] {
  const raw = localStorage.getItem('imageBattleGrid');
  if (!raw) {
    return createEmptyGrid();
  }
  try {
    const parsed = JSON.parse(raw) as Array<{
      imageUrl: string;
      pricePaidNano: string;
      nextPriceNano: string;
      pending: boolean;
    }>;
    if (parsed.length !== BOARD_WIDTH * BOARD_HEIGHT) {
      return createEmptyGrid();
    }
    return parsed.map((cell) => ({
      imageUrl: cell.imageUrl,
      pricePaidNano: BigInt(cell.pricePaidNano),
      nextPriceNano: BigInt(cell.nextPriceNano),
      pending: cell.pending,
    }));
  } catch {
    return createEmptyGrid();
  }
}

function saveGrid(grid: PixelCell[]) {
  localStorage.setItem(
    'imageBattleGrid',
    JSON.stringify(
      grid.map((cell) => ({
        imageUrl: cell.imageUrl,
        pricePaidNano: cell.pricePaidNano.toString(),
        nextPriceNano: cell.nextPriceNano.toString(),
        pending: cell.pending,
      })),
    ),
  );
}

function gridFromSnapshot(snapshotPixels: Awaited<ReturnType<typeof fetchBoardSnapshot>>['pixels']) {
  const nextGrid = createEmptyGrid();
  for (const pixel of snapshotPixels) {
    if (pixel.index >= 0 && pixel.index < nextGrid.length) {
      nextGrid[pixel.index] = {
        imageUrl: pixel.imageUrl,
        pricePaidNano: pixel.pricePaidNano,
        nextPriceNano: pixel.nextPriceNano,
        pending: false,
      };
    }
  }
  return nextGrid;
}

function cellIndex(x: number, y: number): number {
  return y * BOARD_WIDTH + x;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatTon(nano: bigint): string {
  const whole = nano / 1_000_000_000n;
  const fraction = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export default function App() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress(false);
  const [network, setNetwork] = useState<Network>('testnet');
  const [myBoardAddress, setMyBoardAddress] = useState(
    () => localStorage.getItem('myPixelBoardAddress') ?? '',
  );
  const [boardAddress, setBoardAddress] = useState(() => localStorage.getItem('playBoardAddress') ?? '');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [boardSeed, setBoardSeed] = useState(
    () => localStorage.getItem('pixelBoardSeed') ?? createRandomBoardSeed(),
  );
  const [imageUrl, setImageUrl] = useState('https://placehold.co/256x256/png');
  const [selectedCell, setSelectedCell] = useState({ x: 0, y: 0 });
  const [grid, setGrid] = useState<PixelCell[]>(loadGrid);
  const [priceTon, setPriceTon] = useState('0.02');
  const [status, setStatus] = useState('Ready');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [boardZoom, setBoardZoom] = useState(1);

  const selectedIndex = useMemo(() => cellIndex(selectedCell.x, selectedCell.y), [selectedCell]);
  const selectedPixel = grid[selectedIndex];

  useEffect(() => {
    saveGrid(grid);
  }, [grid]);

  useEffect(() => {
    localStorage.setItem('pixelBoardSeed', boardSeed);
  }, [boardSeed]);

  async function ensureWallet() {
    if (!walletAddress) {
      await tonConnectUI.openModal();
      throw new Error('Wallet is not connected');
    }
    return walletAddress;
  }

  async function deployBoard() {
    try {
      const owner = await ensureWallet();
      const payout = payoutWallet.trim() || owner;
      const deployment = createBoardDeployment(owner, payout, network, boardSeed);
      setStatus('Confirm deploy in wallet');
      await tonConnectUI.sendTransaction(deployment.transaction);
      localStorage.setItem('myPixelBoardAddress', deployment.address);
      localStorage.setItem('playBoardAddress', deployment.address);
      setMyBoardAddress(deployment.address);
      setBoardAddress(deployment.address);
      setStatus(`Deploy sent: ${shortAddress(deployment.address)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deploy failed');
    }
  }

  async function placeSelectedImage() {
    try {
      await ensureWallet();
      const normalizedUrl = normalizeImageUrl(imageUrl);
      const tx = createPlaceImageTransaction(
        boardAddress,
        selectedCell.x,
        selectedCell.y,
        normalizedUrl,
        attachedValueForPrice(selectedPixel.nextPriceNano),
        network,
      );
      setStatus(`Confirm ${formatTon(attachedValueForPrice(selectedPixel.nextPriceNano))} TON`);
      await tonConnectUI.sendTransaction(tx);
      setGrid((current) =>
        current.map((cell, index) =>
          index === selectedIndex
            ? {
                imageUrl: normalizedUrl,
                pricePaidNano: selectedPixel.nextPriceNano,
                nextPriceNano: selectedPixel.nextPriceNano * 2n,
                pending: true,
              }
            : cell,
        ),
      );
      setStatus(`Image sent: ${selectedCell.x}, ${selectedCell.y}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Transaction failed');
    }
  }

  async function refreshBoard() {
    try {
      if (!boardAddress.trim()) {
        throw new Error('Board address is empty');
      }
      setIsRefreshing(true);
      setStatus('Refreshing board');
      const snapshot = await fetchBoardSnapshot(boardAddress, network);
      setGrid(gridFromSnapshot(snapshot.pixels));
      setStatus(`Board refreshed: ${snapshot.placedCount} cells`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  }

  function zoomOut() {
    setBoardZoom((current) => Math.max(0.75, Number((current - 0.25).toFixed(2))));
  }

  function zoomIn() {
    setBoardZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))));
  }

  function randomizeBoardSeed() {
    setBoardSeed(createRandomBoardSeed());
  }

  async function setPaused(isPaused: boolean) {
    try {
      await ensureWallet();
      const tx = createSetPausedTransaction(boardAddress, isPaused, network);
      setStatus(isPaused ? 'Confirm pause' : 'Confirm resume');
      await tonConnectUI.sendTransaction(tx);
      setStatus(isPaused ? 'Pause sent' : 'Resume sent');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Admin transaction failed');
    }
  }

  async function updatePrice() {
    try {
      await ensureWallet();
      const tx = createSetPriceTransaction(boardAddress, priceTon, network);
      setStatus('Confirm base price update');
      await tonConnectUI.sendTransaction(tx);
      setStatus('Base price update sent');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Price update failed');
    }
  }

  async function updatePayoutWallet() {
    try {
      await ensureWallet();
      const payout = payoutWallet.trim() || walletAddress;
      const tx = createSetPayoutWalletTransaction(boardAddress, payout, network);
      setStatus('Confirm payout wallet update');
      await tonConnectUI.sendTransaction(tx);
      setStatus('Payout wallet update sent');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Payout update failed');
    }
  }

  function clearLocalGrid() {
    setGrid(createEmptyGrid());
    setStatus('Local grid cleared');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">TON contract game</div>
          <h1>Image Battle</h1>
        </div>
        <TonConnectButton />
      </header>

      <section className="workspace">
        <div className="board-area">
          <div className="board-toolbar">
            <div className="metric">
              <span>Selected</span>
              <strong>{formatTon(selectedPixel.nextPriceNano)} TON</strong>
            </div>
            <div className="metric">
              <span>Attach</span>
              <strong>{formatTon(attachedValueForPrice(selectedPixel.nextPriceNano))} TON</strong>
            </div>
            <div className="tool-group" aria-label="Board tools">
              <button
                className="tool-button"
                disabled={isRefreshing}
                onClick={refreshBoard}
                title="Refresh board"
                type="button"
              >
                <RefreshCw size={17} />
                <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
              </button>
              <button className="tool-button square" onClick={zoomOut} title="Zoom out" type="button">
                <ZoomOut size={17} />
              </button>
              <span className="zoom-value">{Math.round(boardZoom * 100)}%</span>
              <button className="tool-button square" onClick={zoomIn} title="Zoom in" type="button">
                <ZoomIn size={17} />
              </button>
            </div>
            <div className="network-toggle" aria-label="Network">
              <button
                className={network === 'testnet' ? 'active' : ''}
                onClick={() => setNetwork('testnet')}
                type="button"
              >
                Testnet
              </button>
              <button
                className={network === 'mainnet' ? 'active' : ''}
                onClick={() => setNetwork('mainnet')}
                type="button"
              >
                Mainnet
              </button>
            </div>
          </div>

          <div className="board-scroll">
            <div
              className="pixel-board"
              role="grid"
              aria-label="Image board"
              style={{ '--board-size': `${Math.round(640 * boardZoom)}px` } as CSSProperties}
            >
              {grid.map((cell, index) => {
                const x = index % BOARD_WIDTH;
                const y = Math.floor(index / BOARD_WIDTH);
                const selected = selectedCell.x === x && selectedCell.y === y;
                return (
                  <button
                    key={`${x}-${y}`}
                    className={`pixel ${selected ? 'selected' : ''} ${cell.pending ? 'pending' : ''}`}
                    onClick={() => setSelectedCell({ x, y })}
                    type="button"
                    aria-label={`Cell ${x}, ${y}`}
                  >
                    {cell.imageUrl ? <img src={cell.imageUrl} alt="" loading="lazy" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <div className="section-title">
              <Upload size={18} />
              <span>Deploy my board</span>
            </div>
            <label>
              My board address
              <input value={myBoardAddress} readOnly placeholder="Deploy first" />
            </label>
            <label>
              My payout wallet
              <input
                value={payoutWallet}
                onChange={(event) => setPayoutWallet(event.target.value)}
                placeholder={walletAddress || 'Connected wallet'}
              />
            </label>
            <label>
              Board seed
              <input
                min={0}
                max={4294967295}
                type="number"
                value={boardSeed}
                onChange={(event) => setBoardSeed(event.target.value)}
              />
            </label>
            <button className="ghost" onClick={randomizeBoardSeed} type="button">
              <RefreshCw size={18} />
              Random seed
            </button>
            <button className="primary" onClick={deployBoard} type="button">
              <Upload size={18} />
              Deploy board
            </button>
            <div className="hint">
              Deploy value: {DEPLOY_VALUE_TON} TON. Change seed to deploy another board.
            </div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <Grid3X3 size={18} />
              <span>Play on board</span>
            </div>
            <label>
              Board to play on
              <input
                value={boardAddress}
                onChange={(event) => {
                  setBoardAddress(event.target.value);
                  localStorage.setItem('playBoardAddress', event.target.value);
                }}
                placeholder="Paste any board address"
              />
            </label>
            <button
              className="ghost"
              onClick={() => {
                setBoardAddress(myBoardAddress);
                localStorage.setItem('playBoardAddress', myBoardAddress);
              }}
              type="button"
            >
              Use my board
            </button>
            <div className="hint">Paste a friend's board here to buy cells there.</div>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <ImagePlus size={18} />
              <span>Image</span>
            </div>
            <div className="coordinate-row">
              <label>
                X
                <input
                  max={BOARD_WIDTH - 1}
                  min={0}
                  type="number"
                  value={selectedCell.x}
                  onChange={(event) =>
                    setSelectedCell((current) => ({
                      ...current,
                      x: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Y
                <input
                  max={BOARD_HEIGHT - 1}
                  min={0}
                  type="number"
                  value={selectedCell.y}
                  onChange={(event) =>
                    setSelectedCell((current) => ({
                      ...current,
                      y: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <label>
              Image URL
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
            </label>
            <button className="primary" onClick={placeSelectedImage} type="button">
              <ImagePlus size={18} />
              Place image
            </button>
            <div className="hint">Extra buffer: {GAS_BUFFER_TON} TON. Unused value is refunded.</div>
            <button className="ghost" onClick={clearLocalGrid} type="button">
              <Eraser size={18} />
              Clear local
            </button>
          </section>

          <section className="panel-section">
            <div className="section-title">
              <CircleDollarSign size={18} />
              <span>Owner</span>
            </div>
            <label>
              Base price
              <input value={priceTon} onChange={(event) => setPriceTon(event.target.value)} />
            </label>
            <div className="button-row">
              <button className="ghost" onClick={updatePrice} type="button">
                Set price
              </button>
              <button className="ghost" onClick={updatePayoutWallet} type="button">
                Set payout
              </button>
            </div>
            <div className="button-row">
              <button className="ghost" onClick={() => setPaused(true)} type="button">
                <Pause size={16} />
                Pause
              </button>
              <button className="ghost" onClick={() => setPaused(false)} type="button">
                <Play size={16} />
                Resume
              </button>
            </div>
          </section>

          <div className="status-line">{status}</div>
        </aside>
      </section>
    </main>
  );
}
