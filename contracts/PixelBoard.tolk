import "@stdlib/strings"
import "types"

type AllowedPixelBoardMessage = SetPrice | SetPaused | SetPayoutWallet | Withdraw

contract PixelBoard {
    author: "Acton User"
    version: "1.0.0"
    description: "Pixel Battle board with paid pixel placement"
    storage: PixelBoardStorage
    incomingMessages: AllowedPixelBoardMessage
}

fun onInternalMessage(in: InMessage) {
    var body = in.body;
    if (body.remainingBitsCount() >= 32 && body.preloadUint(32) == COMMENT_OPCODE) {
        handleImageComment(in.senderAddress, in.valueCoins, in.createdAt, mutate body);
        return;
    }

    val msg = lazy AllowedPixelBoardMessage.fromSlice(in.body);

    match (msg) {
        SetPrice => {
            var storage = lazy PixelBoardStorage.load();
            assertOwner(in.senderAddress, storage.owner);
            assert (msg.price > 0) throw Errors.InvalidPrice;
            storage.price = msg.price;
            storage.save();
        }
        SetPaused => {
            var storage = lazy PixelBoardStorage.load();
            assertOwner(in.senderAddress, storage.owner);
            storage.isPaused = msg.isPaused;
            storage.save();
        }
        SetPayoutWallet => {
            var storage = lazy PixelBoardStorage.load();
            assertOwner(in.senderAddress, storage.owner);
            storage.payoutWallet = msg.payoutWallet;
            storage.save();
        }
        Withdraw => {
            val storage = lazy PixelBoardStorage.load();
            assertOwner(in.senderAddress, storage.owner);
            assert (msg.amount > 0) throw Errors.InvalidWithdrawAmount;
            sendCoins(msg.to, msg.amount);
        }
        else => {
            assert (in.body.isEmpty()) throw Errors.InvalidMessage;
        }
    }
}

fun onBouncedMessage(_in: InMessageBounced) {}

fun handleImageComment(
    senderAddress: address,
    valueCoins: coins,
    createdAt: uint32,
    mutate body: slice,
) {
    body.skipBits(32);

    val (x, y, imageKind, imageUrl) = parseImageComment(mutate body);
    var storage = lazy PixelBoardStorage.load();
    assert (!storage.isPaused) throw Errors.BoardPaused;
    assert (isInsideBoard(x, y, storage.width, storage.height)) throw Errors.OutOfBounds;

    val key = pixelKey(x, y, storage.width);
    val previous = storage.pixels.get(key);
    val requiredPrice = previous.isFound
        ? (previous.loadValue().pricePaid * 2) as coins
        : storage.price;
    assert (valueCoins >= requiredPrice) throw Errors.InsufficientValue;

    if (!previous.isFound) {
        storage.placedCount += 1;
    }
    storage
        .pixels
        .set(
            key,
            Pixel {
                imageUrl,
                imageKind,
                painter: senderAddress,
                updatedAt: createdAt,
                pricePaid: requiredPrice,
            },
        );
    storage.save();

    sendOwnerShare(storage.payoutWallet, requiredPrice / 2);
}

fun parseImageComment(mutate body: slice): (uint16, uint16, uint8, string) {
    assert (body.remainingBitsCount() >= 8 * 12) throw Errors.InvalidImageComment;
    assert (body.loadUint(8) == CHAR_P) throw Errors.InvalidImageComment;
    assert (body.loadUint(8) == CHAR_B) throw Errors.InvalidImageComment;
    assert (body.loadUint(8) == CHAR_COLON) throw Errors.InvalidImageComment;

    val x = parseHexByte(body.loadUint(8), body.loadUint(8));
    val y = parseHexByte(body.loadUint(8), body.loadUint(8));
    assert (body.loadUint(8) == CHAR_COLON) throw Errors.InvalidImageComment;

    val imageKind = parseImageKind(mutate body);
    assert (body.loadUint(8) == CHAR_COLON) throw Errors.InvalidImageComment;

    val imageUrl = beginCell().storeSlice(body).endCell() as unknown as string;
    val urlLength = imageUrl.calculateLength();
    assert (urlLength > 0 && urlLength <= MAX_IMAGE_URL_BYTES) throw Errors.InvalidImageComment;

    return (x, y, imageKind, imageUrl);
}

fun parseHexByte(high: int, low: int): uint16 {
    return (parseHexNibble(high) * 16 + parseHexNibble(low)) as uint16;
}

fun parseHexNibble(char: int): int {
    if (char >= 0x30 && char <= 0x39) {
        return char - 0x30;
    }
    if (char >= 0x61 && char <= 0x66) {
        return char - 0x61 + 10;
    }
    assert (false) throw Errors.InvalidImageComment;
    return 0;
}

fun parseImageKind(mutate body: slice): uint8 {
    val first = body.loadUint(8);
    if (first == CHAR_J) {
        assert (body.loadUint(8) == CHAR_P) throw Errors.InvalidImageComment;
        assert (body.loadUint(8) == CHAR_G) throw Errors.InvalidImageComment;
        return IMAGE_KIND_JPG;
    }
    if (first == CHAR_P) {
        assert (body.loadUint(8) == CHAR_N) throw Errors.InvalidImageComment;
        assert (body.loadUint(8) == CHAR_G) throw Errors.InvalidImageComment;
        return IMAGE_KIND_PNG;
    }
    if (first == CHAR_W) {
        assert (body.loadUint(8) == CHAR_E) throw Errors.InvalidImageComment;
        assert (body.loadUint(8) == CHAR_B) throw Errors.InvalidImageComment;
        assert (body.loadUint(8) == CHAR_P) throw Errors.InvalidImageComment;
        return IMAGE_KIND_WEBP;
    }
    assert (false) throw Errors.InvalidImageComment;
    return 0;
}

fun assertOwner(sender: address, owner: address) {
    assert (sender == owner) throw Errors.NotOwner;
}

fun isInsideBoard(x: uint16, y: uint16, width: uint16, height: uint16): bool {
    return x < width && y < height;
}

fun pixelKey(x: uint16, y: uint16, width: uint16): uint32 {
    return (y as int * width as int + x as int) as uint32;
}

fun sendOwnerShare(payoutWallet: address, amount: coins) {
    sendCoins(payoutWallet, amount);
}

fun sendCoins(to: address, amount: coins) {
    val payout = createMessage({
        bounce: false,
        value: amount,
        dest: to,
    });
    payout.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

get fun owner(): address {
    val storage = lazy PixelBoardStorage.load();
    return storage.owner;
}

get fun payoutWallet(): address {
    val storage = lazy PixelBoardStorage.load();
    return storage.payoutWallet;
}

get fun config(): (
    address,
    address,
    uint16,
    uint16,
    coins,
    bool,
    uint32,
) {
    val storage = lazy PixelBoardStorage.load();
    return (
        storage.owner,
        storage.payoutWallet,
        storage.width,
        storage.height,
        storage.price,
        storage.isPaused,
        storage.placedCount,
    );
}

get fun pixel(x: uint16, y: uint16): (
    bool,
    string,
    uint8,
    address,
    uint32,
    coins,
    coins,
) {
    val storage = lazy PixelBoardStorage.load();
    assert (isInsideBoard(x, y, storage.width, storage.height)) throw Errors.OutOfBounds;

    val result = storage.pixels.get(pixelKey(x, y, storage.width));
    if (result.isFound) {
        val px = result.loadValue();
        return (
            true,
            px.imageUrl,
            px.imageKind,
            px.painter,
            px.updatedAt,
            px.pricePaid,
            px.pricePaid * 2,
        );
    }

    return (
        false,
        "",
        0,
        storage.owner,
        0,
        0,
        storage.price,
    );
}
