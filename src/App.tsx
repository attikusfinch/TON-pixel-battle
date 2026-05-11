import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  BookmarkPlus,
  CircleDollarSign,
  Eraser,
  Grid3X3,
  ImagePlus,
  Layers3,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
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

type ActiveView = 'boards' | 'deploy' | 'place' | 'manage';

type SavedBoard = {
  id: string;
  address: string;
  network: Network;
  label: string;
  savedAt: number;
};

const SAVED_BOARDS_KEY = 'imageBattleSavedBoards';

function createEmptyGrid(): PixelCell[] {
  return Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, () => ({
    imageUrl: '',
    pricePaidNano: 0n,
    nextPriceNano: BASE_PIXEL_PRICE_NANO,
    pending: false,
  }));
}

function clampCoordinate(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, Math.trunc(value)));
}

function gridStorageKey(network: Network, boardAddress: string): string {
  const normalizedAddress = boardAddress.trim();
  return normalizedAddress
    ? `imageBattleGrid:${network}:${normalizedAddress}`
    : `imageBattleGrid:${network}:draft`;
}

function parseStoredGrid(raw: string | null): PixelCell[] {
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

function loadGrid(key: string): PixelCell[] {
  return parseStoredGrid(localStorage.getItem(key));
}

function saveGrid(key: string, grid: PixelCell[]) {
  localStorage.setItem(
    key,
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

function boardId(network: Network, address: string): string {
  return `${network}:${address.trim()}`;
}

function loadSavedBoards(): SavedBoard[] {
  const raw = localStorage.getItem(SAVED_BOARDS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SavedBoard[];
    return parsed.filter((board) => board.address && (board.network === 'testnet' || board.network === 'mainnet'));
  } catch {
    return [];
  }
}

function saveSavedBoards(boards: SavedBoard[]) {
  localStorage.setItem(SAVED_BOARDS_KEY, JSON.stringify(boards));
}

type GridState = {
  key: string;
  cells: PixelCell[];
};

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
  if (address.length <= 18) {
    return address;
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function countPlacedCells(grid: PixelCell[]): number {
  return grid.filter((cell) => cell.imageUrl).length;
}

function formatTon(nano: bigint): string {
  const whole = nano / 1_000_000_000n;
  const fraction = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export default function App() {
  const [tonConnectUI] = useTonConnectUI();
  const walletAddress = useTonAddress(false);
  const [activeView, setActiveView] = useState<ActiveView>('boards');
  const [network, setNetwork] = useState<Network>(
    () => (localStorage.getItem('pixelBattleNetwork') as Network | null) ?? 'testnet',
  );
  const [myBoardAddress, setMyBoardAddress] = useState(
    () => localStorage.getItem('myPixelBoardAddress') ?? '',
  );
  const [boardAddress, setBoardAddress] = useState(() => localStorage.getItem('playBoardAddress') ?? '');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [boardSeed, setBoardSeed] = useState(
    () => localStorage.getItem('pixelBoardSeed') ?? createRandomBoardSeed(),
  );
  const [imageUrl, setImageUrl] = useState('https://placehold.co/512x512.png');
  const [selectedCell, setSelectedCell] = useState({ x: 0, y: 0 });
  const activeGridKey = useMemo(() => gridStorageKey(network, boardAddress), [boardAddress, network]);
  const [gridState, setGridState] = useState<GridState>(() => ({
    key: activeGridKey,
    cells: loadGrid(activeGridKey),
  }));
  const [savedBoards, setSavedBoards] = useState<SavedBoard[]>(loadSavedBoards);
  const [priceTon, setPriceTon] = useState('0.02');
  const [status, setStatus] = useState('Ready');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [boardZoom, setBoardZoom] = useState(1);

  const grid = gridState.cells;
  const selectedIndex = useMemo(() => cellIndex(selectedCell.x, selectedCell.y), [selectedCell]);
  const selectedPixel =
    grid[selectedIndex] ?? {
      imageUrl: '',
      pricePaidNano: 0n,
      nextPriceNano: BASE_PIXEL_PRICE_NANO,
      pending: false,
    };
  const placedCells = useMemo(() => countPlacedCells(grid), [grid]);
  const previewImageUrl = useMemo(() => {
    try {
      return normalizeImageUrl(imageUrl);
    } catch {
      return '';
    }
  }, [imageUrl]);
  const nextBoardAddress = useMemo(() => {
    if (!walletAddress) {
      return '';
    }
    try {
      const payout = payoutWallet.trim() || walletAddress;
      return createBoardDeployment(walletAddress, payout, network, boardSeed).address;
    } catch {
      return '';
    }
  }, [boardSeed, network, payoutWallet, walletAddress]);

  useEffect(() => {
    setGridState((current) =>
      current.key === activeGridKey
        ? current
        : {
            key: activeGridKey,
            cells: loadGrid(activeGridKey),
          },
    );
    setSelectedCell({ x: 0, y: 0 });
  }, [activeGridKey]);

  useEffect(() => {
    saveGrid(gridState.key, gridState.cells);
  }, [gridState]);

  useEffect(() => {
    localStorage.setItem('pixelBoardSeed', boardSeed);
  }, [boardSeed]);

  useEffect(() => {
    localStorage.setItem('pixelBattleNetwork', network);
  }, [network]);

  useEffect(() => {
    saveSavedBoards(savedBoards);
  }, [savedBoards]);

  function setGridForKey(
    key: string,
    nextGrid: PixelCell[] | ((current: PixelCell[]) => PixelCell[]),
  ) {
    setGridState((current) => {
      const currentCells = current.key === key ? current.cells : loadGrid(key);
      return {
        key,
        cells: typeof nextGrid === 'function' ? nextGrid(currentCells) : nextGrid,
      };
    });
  }

  function setPlayBoard(address: string, boardNetwork = network) {
    setNetwork(boardNetwork);
    setBoardAddress(address);
    localStorage.setItem('playBoardAddress', address);
  }

  function rememberBoard(address: string, boardNetwork = network, label?: string) {
    const normalizedAddress = address.trim();
    if (!normalizedAddress) {
      throw new Error('Board address is empty');
    }
    const id = boardId(boardNetwork, normalizedAddress);
    setSavedBoards((current) => {
      const savedBoard: SavedBoard = {
        id,
        address: normalizedAddress,
        network: boardNetwork,
        label: label ?? `Board ${shortAddress(normalizedAddress)}`,
        savedAt: Date.now(),
      };
      return [savedBoard, ...current.filter((board) => board.id !== id)].slice(0, 12);
    });
  }

  function saveCurrentBoard() {
    try {
      rememberBoard(boardAddress);
      setStatus(`Board saved: ${shortAddress(boardAddress)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed');
    }
  }

  function removeSavedBoard(id: string) {
    setSavedBoards((current) => current.filter((board) => board.id !== id));
  }

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
      rememberBoard(deployment.address, network, `Seed ${boardSeed}`);
      setGridForKey(gridStorageKey(network, deployment.address), createEmptyGrid());
      setActiveView('boards');
      setStatus(`Deploy sent: ${shortAddress(deployment.address)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deploy failed');
    }
  }

  async function placeSelectedImage() {
    try {
      await ensureWallet();
      const normalizedUrl = normalizeImageUrl(imageUrl);
      const targetGridKey = activeGridKey;
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
      setGridForKey(targetGridKey, (current) =>
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
      const targetGridKey = gridStorageKey(network, boardAddress);
      const snapshot = await fetchBoardSnapshot(boardAddress, network);
      setGridForKey(targetGridKey, gridFromSnapshot(snapshot.pixels));
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
    setGridForKey(activeGridKey, createEmptyGrid());
    setStatus('Local grid cleared');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">IB</div>
          <div>
            <div className="eyebrow">TON contract game</div>
            <h1>Image Battle</h1>
          </div>
        </div>
        <nav className="mode-tabs" aria-label="Workspace">
          <button
            className={activeView === 'boards' ? 'active' : ''}
            onClick={() => setActiveView('boards')}
            type="button"
          >
            <Layers3 size={17} />
            Boards
          </button>
          <button
            className={activeView === 'deploy' ? 'active' : ''}
            onClick={() => setActiveView('deploy')}
            type="button"
          >
            <Upload size={17} />
            Deploy
          </button>
          <button
            className={activeView === 'place' ? 'active' : ''}
            onClick={() => setActiveView('place')}
            type="button"
          >
            <ImagePlus size={17} />
            Image
          </button>
          <button
            className={activeView === 'manage' ? 'active' : ''}
            onClick={() => setActiveView('manage')}
            type="button"
          >
            <Settings2 size={17} />
            Owner
          </button>
        </nav>
        <TonConnectButton />
      </header>

      <section className="app-intro">
        <div>
          <p className="intro-kicker">On-chain image board</p>
          <h2>Buy a square. Replace it for 2x. Make the board loud.</h2>
        </div>
        <div className="intro-stats">
          <div>
            <span>Board</span>
            <strong>32x32</strong>
          </div>
          <div>
            <span>Base</span>
            <strong>0.02 TON</strong>
          </div>
          <div>
            <span>Placed</span>
            <strong>{placedCells}</strong>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="board-area surface">
          <div className="board-toolbar">
            <div className="board-heading">
              <span>{boardAddress ? shortAddress(boardAddress) : 'No board selected'}</span>
              <strong>
                Cell {selectedCell.x}, {selectedCell.y}
              </strong>
            </div>
            <div className="metric">
              <span>Price</span>
              <strong>{formatTon(selectedPixel.nextPriceNano)} TON</strong>
            </div>
            <div className="metric">
              <span>Attach</span>
              <strong>{formatTon(attachedValueForPrice(selectedPixel.nextPriceNano))}</strong>
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
          {activeView === 'boards' ? (
            <section className="tool-panel">
              <div className="section-title">
                <Grid3X3 size={18} />
                <span>Boards</span>
              </div>
              <label>
                Active board
                <input
                  value={boardAddress}
                  onChange={(event) => setPlayBoard(event.target.value)}
                  placeholder="Board address"
                />
              </label>
              <div className="button-row">
                <button className="ghost" onClick={saveCurrentBoard} type="button">
                  <BookmarkPlus size={17} />
                  Save
                </button>
                <button className="ghost" onClick={() => setPlayBoard(myBoardAddress)} type="button">
                  <Grid3X3 size={17} />
                  Mine
                </button>
              </div>
              <div className="saved-list">
                {savedBoards.length ? (
                  savedBoards.map((board) => (
                    <div className="saved-board" key={board.id}>
                      <button
                        className="saved-main"
                        onClick={() => setPlayBoard(board.address, board.network)}
                        type="button"
                      >
                        <strong>{board.label}</strong>
                        <span>
                          {board.network} · {shortAddress(board.address)}
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => removeSavedBoard(board.id)}
                        title="Remove board"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No saved boards</div>
                )}
              </div>
              <button className="ghost" onClick={clearLocalGrid} type="button">
                <Eraser size={17} />
                Clear local
              </button>
            </section>
          ) : null}

          {activeView === 'deploy' ? (
            <section className="tool-panel">
              <div className="section-title">
                <Upload size={18} />
                <span>Deploy</span>
              </div>
              <label>
                My board address
                <input value={myBoardAddress} readOnly placeholder="Deploy first" />
              </label>
              <label>
                Payout wallet
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
              <label>
                Next address
                <input value={nextBoardAddress} readOnly placeholder="Connect wallet" />
              </label>
              <div className="button-row">
                <button className="ghost" onClick={randomizeBoardSeed} type="button">
                  <RefreshCw size={17} />
                  Seed
                </button>
                <button className="primary" onClick={deployBoard} type="button">
                  <Upload size={17} />
                  Deploy
                </button>
              </div>
              <div className="compact-meta">
                <span>Deploy</span>
                <strong>{DEPLOY_VALUE_TON} TON</strong>
              </div>
            </section>
          ) : null}

          {activeView === 'place' ? (
            <section className="tool-panel">
              <div className="section-title">
                <ImagePlus size={18} />
                <span>Image</span>
              </div>
              <div className="image-preview">
                {previewImageUrl ? <img src={previewImageUrl} alt="" /> : <span>Preview</span>}
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
                        x: clampCoordinate(Number(event.target.value), BOARD_WIDTH - 1),
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
                        y: clampCoordinate(Number(event.target.value), BOARD_HEIGHT - 1),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Image URL
                <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
              </label>
              <div className="price-strip">
                <div>
                  <span>Cell price</span>
                  <strong>{formatTon(selectedPixel.nextPriceNano)} TON</strong>
                </div>
                <div>
                  <span>Attach</span>
                  <strong>{formatTon(attachedValueForPrice(selectedPixel.nextPriceNano))} TON</strong>
                </div>
              </div>
              <button className="primary full-width" onClick={placeSelectedImage} type="button">
                <ImagePlus size={18} />
                Place image
              </button>
              <div className="compact-meta">
                <span>Buffer</span>
                <strong>{GAS_BUFFER_TON} TON</strong>
              </div>
            </section>
          ) : null}

          {activeView === 'manage' ? (
            <section className="tool-panel">
              <div className="section-title">
                <CircleDollarSign size={18} />
                <span>Owner</span>
              </div>
              <label>
                Base price
                <input value={priceTon} onChange={(event) => setPriceTon(event.target.value)} />
              </label>
              <label>
                Payout wallet
                <input
                  value={payoutWallet}
                  onChange={(event) => setPayoutWallet(event.target.value)}
                  placeholder={walletAddress || 'Connected wallet'}
                />
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
          ) : null}

          <div className="status-line">{status}</div>
        </aside>
      </section>
    </main>
  );
}
