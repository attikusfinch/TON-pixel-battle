import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"

import "@contracts/types"
import "@wrappers/PixelBoard.gen"

fun main() {
    val deployer = scripts.wallet("deployer");

    val board = PixelBoard.fromStorage(PixelBoardStorage {
        owner: deployer.address,
        payoutWallet: deployer.address,
        width: DEFAULT_BOARD_WIDTH,
        height: DEFAULT_BOARD_HEIGHT,
        price: DEFAULT_PIXEL_PRICE,
        isPaused: false,
        placedCount: 0,
        pixels: [],
    });
    val res = board.deploy(deployer.address, { value: ton("0.5") });
    if (res.waitForFirstTransaction() == null) {
        return;
    }

    println("Deployed PixelBoard to {}", board.address);
    println("Owner and payout wallet: {}", deployer.address);
    println("Pixel price: {:ton}", DEFAULT_PIXEL_PRICE);
}
