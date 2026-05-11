const DEFAULT_PIXEL_PRICE = 20000000
const DEFAULT_BOARD_WIDTH = 32
const DEFAULT_BOARD_HEIGHT = 32
const MAX_IMAGE_URL_BYTES = 240
const IMAGE_KIND_JPG = 1
const IMAGE_KIND_PNG = 2
const IMAGE_KIND_WEBP = 3

const COMMENT_OPCODE = 0
const CHAR_COLON = 0x3A
const CHAR_B = 0x62
const CHAR_E = 0x65
const CHAR_G = 0x67
const CHAR_J = 0x6A
const CHAR_P = 0x70
const CHAR_N = 0x6E
const CHAR_W = 0x77

enum Errors {
    OutOfBounds = 100
    InvalidImageComment = 101
    InsufficientValue = 102
    BoardPaused = 103
    NotOwner = 104
    InvalidPrice = 105
    InvalidWithdrawAmount = 106
    InvalidMessage = 0xFFFF
}

struct Pixel {
    imageUrl: string
    imageKind: uint8
    painter: address
    updatedAt: uint32
    pricePaid: coins
}

struct PixelBoardStorage {
    owner: address
    payoutWallet: address
    seed: uint32
    width: uint16
    height: uint16
    price: coins
    isPaused: bool
    placedCount: uint32
    pixels: map<uint32, Pixel>
}

fun PixelBoardStorage.load(): PixelBoardStorage {
    return PixelBoardStorage.fromCell(contract.getData());
}

fun PixelBoardStorage.save(self) {
    contract.setData(self.toCell());
}

struct (0x70726963) SetPrice {
    price: coins
}

struct (0x70617573) SetPaused {
    isPaused: bool
}

struct (0x70617977) SetPayoutWallet {
    payoutWallet: address
}

struct (0x77697468) Withdraw {
    amount: coins
    to: address
}
