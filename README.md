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

The UI has two separate flows:

- Deploy your own board and choose the payout wallet.
- Paste any existing board address and buy cells on that board.
