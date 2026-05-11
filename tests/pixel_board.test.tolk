import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"

import "@contracts/types"
import "@wrappers/PixelBoard.gen"

get fun `test deploy exposes configured board`() {
    val (board, owner, payout, _) = setupTest();

    val (
        ownerAddress,
        payoutAddress,
        width,
        height,
        price,
        isPaused,
        placedCount,
    ) = board.config();
    expect(ownerAddress).toEqual(owner.address);
    expect(payoutAddress).toEqual(payout.address);
    expect(width).toEqual(DEFAULT_BOARD_WIDTH);
    expect(height).toEqual(DEFAULT_BOARD_HEIGHT);
    expect(price).toEqual(DEFAULT_PIXEL_PRICE);
    expect(isPaused).toEqual(false);
    expect(placedCount).toEqual(0);
}

get fun `test player places image comment and owner wallet receives payout`() {
    val (board, _, payout, alice) = setupTest();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0203:png:https://img.test/cat.png"),
        { value: ton("0.02") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toHaveSuccessfulTx({
        from: alice.address,
        to: board.address,
        value: ton("0.02"),
    });
    expect(res).toHaveSuccessfulTx({
        from: board.address,
        to: payout.address,
    });

    val (
        exists,
        imageUrl,
        imageKind,
        painter,
        _,
        pricePaid,
        nextPrice,
    ) = board.pixel(2, 3);
    expect(exists).toEqual(true);
    expect(imageUrl).toEqual("https://img.test/cat.png");
    expect(imageKind).toEqual(IMAGE_KIND_PNG);
    expect(painter).toEqual(alice.address);
    expect(pricePaid).toEqual(ton("0.02"));
    expect(nextPrice).toEqual(ton("0.04"));

    val (
        _,
        _,
        _,
        _,
        _,
        _,
        placedCount,
    ) = board.config();
    expect(placedCount).toEqual(1);
}

get fun `test repurchase requires double price`() {
    val (board, _, payout, alice) = setupTest();

    val first = board.sendAny(
        alice.address,
        rawComment("pb:0404:jpg:https://img.test/a.jpg"),
        { value: ton("0.02") },
    );
    expect(first).toHaveAllSuccessfulTxs();

    val underpaid = board.sendAny(
        alice.address,
        rawComment("pb:0404:webp:https://img.test/b.webp"),
        { value: ton("0.02") },
    );
    expect(underpaid).toHaveFailedTx({
        from: alice.address,
        to: board.address,
        exitCode: Errors.InsufficientValue,
    });

    val second = board.sendAny(
        alice.address,
        rawComment("pb:0404:webp:https://img.test/b.webp"),
        { value: ton("0.04") },
    );
    expect(second).toHaveAllSuccessfulTxs();
    expect(second).toHaveSuccessfulTx({
        from: board.address,
        to: payout.address,
    });

    val (
        _,
        imageUrl,
        imageKind,
        _,
        _,
        pricePaid,
        nextPrice,
    ) = board.pixel(4, 4);
    expect(imageUrl).toEqual("https://img.test/b.webp");
    expect(imageKind).toEqual(IMAGE_KIND_WEBP);
    expect(pricePaid).toEqual(ton("0.04"));
    expect(nextPrice).toEqual(ton("0.08"));

    val (
        _,
        _,
        _,
        _,
        _,
        _,
        placedCount,
    ) = board.config();
    expect(placedCount).toEqual(1);
}

get fun `test high repurchase sends payout to owner`() {
    val (board, _, payout, alice) = setupTest();

    val first = board.sendAny(
        alice.address,
        rawComment("pb:0505:png:https://img.test/one.png"),
        { value: ton("0.02") },
    );
    expect(first).toHaveAllSuccessfulTxs();

    val second = board.sendAny(
        alice.address,
        rawComment("pb:0505:png:https://img.test/two.png"),
        { value: ton("0.04") },
    );
    expect(second).toHaveAllSuccessfulTxs();

    val third = board.sendAny(
        alice.address,
        rawComment("pb:0505:png:https://img.test/three.png"),
        { value: ton("0.08") },
    );
    expect(third).toHaveAllSuccessfulTxs();

    val fourth = board.sendAny(
        alice.address,
        rawComment("pb:0505:png:https://img.test/four.png"),
        { value: ton("0.16") },
    );
    expect(fourth).toHaveAllSuccessfulTxs();
    expect(fourth).toHaveSuccessfulTx({
        from: board.address,
        to: payout.address,
    });

    val (
        _,
        imageUrl,
        _,
        _,
        _,
        pricePaid,
        nextPrice,
    ) = board.pixel(5, 5);
    expect(imageUrl).toEqual("https://img.test/four.png");
    expect(pricePaid).toEqual(ton("0.16"));
    expect(nextPrice).toEqual(ton("0.32"));
}

get fun `test overpay buffer is refunded to player`() {
    val (board, _, payout, alice) = setupTest();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0606:png:https://img.test/refund.png"),
        { value: ton("0.05") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toHaveSuccessfulTx({
        from: board.address,
        to: payout.address,
    });
    expect(res).toHaveSuccessfulTx({
        from: board.address,
        to: alice.address,
    });

    val (
        _,
        imageUrl,
        _,
        _,
        _,
        pricePaid,
        nextPrice,
    ) = board.pixel(6, 6);
    expect(imageUrl).toEqual("https://img.test/refund.png");
    expect(pricePaid).toEqual(ton("0.02"));
    expect(nextPrice).toEqual(ton("0.04"));
}

get fun `test rejects underpaid empty cell`() {
    val (board, _, _, alice) = setupTest();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0000:png:https://img.test/a.png"),
        { value: ton("0.01") },
    );
    expect(res).toHaveFailedTx({
        from: alice.address,
        to: board.address,
        exitCode: Errors.InsufficientValue,
    });
}

get fun `test rejects out of bounds image comment`() {
    val (board, _, _, alice) = setupTest();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:2000:png:https://img.test/a.png"),
        { value: ton("0.02") },
    );
    expect(res).toHaveFailedTx({
        from: alice.address,
        to: board.address,
        exitCode: Errors.OutOfBounds,
    });
}

get fun `test rejects unsupported image kind`() {
    val (board, _, _, alice) = setupTest();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0000:gif:https://img.test/a.gif"),
        { value: ton("0.02") },
    );
    expect(res).toHaveFailedTx({
        from: alice.address,
        to: board.address,
        exitCode: Errors.InvalidImageComment,
    });
}

get fun `test owner can pause board`() {
    val (board, owner, _, alice) = setupTest();

    val pause = board.sendSetPaused(owner.address, true, { value: ton("0.02") });
    expect(pause).toHaveAllSuccessfulTxs();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0000:png:https://img.test/a.png"),
        { value: ton("0.02") },
    );
    expect(res).toHaveFailedTx({
        from: alice.address,
        to: board.address,
        exitCode: Errors.BoardPaused,
    });
}

get fun `test non owner cannot change base price`() {
    val (board, _, _, alice) = setupTest();

    val res = board.sendSetPrice(alice.address, ton("0.05"), { value: ton("0.02") });
    expect(res).toHaveFailedTx<SetPrice>({
        from: alice.address,
        to: board.address,
        exitCode: Errors.NotOwner,
    });
}

get fun `test owner can update payout wallet and base price`() {
    val (board, owner, _, alice) = setupTest();

    val newPayout = testing.treasury("newPayout");
    val updateWallet = board.sendSetPayoutWallet(
        owner.address,
        newPayout.address,
        { value: ton("0.02") },
    );
    expect(updateWallet).toHaveAllSuccessfulTxs();

    val updatePrice = board.sendSetPrice(owner.address, ton("0.04"), { value: ton("0.02") });
    expect(updatePrice).toHaveAllSuccessfulTxs();

    val res = board.sendAny(
        alice.address,
        rawComment("pb:0101:png:https://img.test/paid.png"),
        { value: ton("0.04") },
    );
    expect(res).toHaveAllSuccessfulTxs();
    expect(res).toHaveSuccessfulTx({
        from: board.address,
        to: newPayout.address,
    });
}

fun setupTest(): (PixelBoard, Treasury, Treasury, Treasury) {
    val owner = testing.treasury("owner");
    val payout = testing.treasury("payout");
    val alice = testing.treasury("alice");

    val board = PixelBoard.fromStorage(PixelBoardStorage {
        owner: owner.address,
        payoutWallet: payout.address,
        width: DEFAULT_BOARD_WIDTH,
        height: DEFAULT_BOARD_HEIGHT,
        price: DEFAULT_PIXEL_PRICE,
        isPaused: false,
        placedCount: 0,
        pixels: [],
    });
    val res = board.deploy(owner.address, { value: ton("0.5") });
    expect(res).toHaveSuccessfulDeploy({
        to: board.address,
    });

    return (board, owner, payout, alice);
}

fun rawComment(comment: string): cell {
    return beginCell().storeUint(COMMENT_OPCODE, 32).storeSlice(comment.beginParse()).endCell();
}
