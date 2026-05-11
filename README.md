# Image Battle

Acton + React prototype for a TON image-board game.

Players send a TON transfer with a standard text comment. The contract parses the
comment, stores the image URL for a board cell, and sends the cell price to the
creator payout wallet. The frontend attaches an extra gas buffer; the contract
refunds unused value back to the player.

## Rules

- Board size: `32x32`.
- Empty cell price: `0.02 TON`.
- Repurchasing the same cell costs `2x` the previous paid price.
- The frontend sends the cell price plus a gas buffer.
- The contract sends the cell price to the creator payout wallet and refunds
  unused extra value to the player.
- Accepted image URL kinds: `jpg`, `jpeg`, `png`, `webp`.
- Transfer comment format:

```text
pb:<xx><yy>:<jpg|png|webp>:<url>
```

Example:

```text
pb:021f:png:https://example.com/image.png
```

## Contract

```bash
acton build
acton check
acton fmt --check
acton test
```

Regenerate wrappers after ABI changes:

```bash
acton wrapper PixelBoard
acton wrapper PixelBoard --ts
```

## Frontend

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

The frontend uses TON Connect directly. There is no backend: React creates the
deploy `stateInit` and transfer comment payload locally, then the wallet signs
and broadcasts the transaction.

TON Connect uses the manifest from the GitHub repo by default:
`https://raw.githubusercontent.com/attikusfinch/TON-pixel-battle/cceb10a1465c8efdc106cf4341916b7def9a0275/public/tonconnect-manifest.json`.
After manifest/icon changes, push `master` so wallets can fetch the latest
HTTPS version. Override with `VITE_TONCONNECT_MANIFEST_URL` if you deploy the
app to your own domain later.
The icon is a 180x180 PNG because TON Connect wallets do not accept SVG icons
in manifests.

The UI has two separate flows:

- Deploy your own board and choose the payout wallet.
- Paste any existing board address and buy cells on that board.
