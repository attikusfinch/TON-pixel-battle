// AUTO-GENERATED, do not edit
// It's a TypeScript wrapper for a PixelBoard contract in Tolk.
/* eslint-disable */

import * as c from '@ton/core';
import { beginCell, ContractProvider, Sender, SendMode } from '@ton/core';

// ————————————————————————————————————————————
//   predefined types and functions
//

type StoreCallback<T> = (obj: T, b: c.Builder) => void
type LoadCallback<T> = (s: c.Slice) => T

export type CellRef<T> = {
    ref: T
}

function makeCellFrom<T>(self: T, storeFn_T: StoreCallback<T>): c.Cell {
    let b = beginCell();
    storeFn_T(self, b);
    return b.endCell();
}

function loadAndCheckPrefix32(s: c.Slice, expected: number, structName: string): void {
    let prefix = s.loadUint(32);
    if (prefix !== expected) {
        throw new Error(`Incorrect prefix for '${structName}': expected 0x${expected.toString(16).padStart(8, '0')}, got 0x${prefix.toString(16).padStart(8, '0')}`);
    }
}

function lookupPrefix(s: c.Slice, expected: number, prefixLen: number): boolean {
    return s.remainingBits >= prefixLen && s.preloadUint(prefixLen) === expected;
}

function throwNonePrefixMatch(fieldPath: string): never {
    throw new Error(`Incorrect prefix for '${fieldPath}': none of variants matched`);
}

function storeCellRef<T>(cell: CellRef<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    let b_ref = c.beginCell();
    storeFn_T(cell.ref, b_ref);
    b.storeRef(b_ref.endCell());
}

function loadCellRef<T>(s: c.Slice, loadFn_T: LoadCallback<T>): CellRef<T> {
    let s_ref = s.loadRef().beginParse();
    return { ref: loadFn_T(s_ref) };
}

function storeTolkNullable<T>(v: T | null, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v === null) {
        b.storeUint(0, 1);
    } else {
        b.storeUint(1, 1);
        storeFn_T(v, b);
    }
}

function createDictionaryValue<V>(loadFn_V: LoadCallback<V>, storeFn_V: StoreCallback<V>): c.DictionaryValue<V> {
    return {
        serialize(self: V, b: c.Builder) {
            storeFn_V(self, b);
        },
        parse(s: c.Slice): V {
            const value = loadFn_V(s);
            s.endParse();
            return value;
        }
    }
}

// ————————————————————————————————————————————
//   parse get methods result from a TVM stack
//

class StackReader {
    constructor(private tuple: c.TupleItem[]) {
    }

    static fromGetMethod(expectedN: number, getMethodResult: { stack: c.TupleReader }): StackReader {
        let tuple = [] as c.TupleItem[];
        while (getMethodResult.stack.remaining) {
            tuple.push(getMethodResult.stack.pop());
        }
        if (tuple.length !== expectedN) {
            throw new Error(`expected ${expectedN} stack width, got ${tuple.length}`);
        }
        return new StackReader(tuple);
    }

    private popExpecting<ItemT>(itemType: string): ItemT {
        const item = this.tuple.shift();
        if (item?.type === itemType) {
            return item as ItemT;
        }
        throw new Error(`not '${itemType}' on a stack`);
    }

    private popCellLike(): c.Cell {
        const item = this.tuple.shift();
        if (item && (item.type === 'cell' || item.type === 'slice' || item.type === 'builder')) {
            return item.cell;
        }
        throw new Error(`not cell/slice on a stack`);
    }

    readBigInt(): bigint {
        return this.popExpecting<c.TupleItemInt>('int').value;
    }

    readBoolean(): boolean {
        return this.popExpecting<c.TupleItemInt>('int').value !== 0n;
    }

    readCell(): c.Cell {
        return this.popCellLike();
    }

    readSlice(): c.Slice {
        return this.popCellLike().beginParse();
    }

    readSnakeString(): string {
        return this.readCell().beginParse().loadStringTail();
    }
}

// ————————————————————————————————————————————
//   auto-generated serializers to/from cells
//

type coins = bigint

type uint8 = bigint
type uint16 = bigint
type uint32 = bigint

/**
 > struct Pixel {
 >     imageUrl: string
 >     imageKind: uint8
 >     painter: address
 >     updatedAt: uint32
 >     pricePaid: coins
 > }
 */
export interface Pixel {
    readonly $: 'Pixel'
    imageUrl: string
    imageKind: uint8
    painter: c.Address
    updatedAt: uint32
    pricePaid: coins
}

export const Pixel = {
    create(args: {
        imageUrl: string
        imageKind: uint8
        painter: c.Address
        updatedAt: uint32
        pricePaid: coins
    }): Pixel {
        return {
            $: 'Pixel',
            ...args
        }
    },
    fromSlice(s: c.Slice): Pixel {
        return {
            $: 'Pixel',
            imageUrl: s.loadStringRefTail(),
            imageKind: s.loadUintBig(8),
            painter: s.loadAddress(),
            updatedAt: s.loadUintBig(32),
            pricePaid: s.loadCoins(),
        }
    },
    store(self: Pixel, b: c.Builder): void {
        b.storeStringRefTail(self.imageUrl);
        b.storeUint(self.imageKind, 8);
        b.storeAddress(self.painter);
        b.storeUint(self.updatedAt, 32);
        b.storeCoins(self.pricePaid);
    },
    toCell(self: Pixel): c.Cell {
        return makeCellFrom<Pixel>(self, Pixel.store);
    }
}

/**
 > struct PixelBoardStorage {
 >     owner: address
 >     payoutWallet: address
 >     width: uint16
 >     height: uint16
 >     price: coins
 >     isPaused: bool
 >     placedCount: uint32
 >     pixels: map<uint32, Pixel>
 > }
 */
export interface PixelBoardStorage {
    readonly $: 'PixelBoardStorage'
    owner: c.Address
    payoutWallet: c.Address
    width: uint16
    height: uint16
    price: coins
    isPaused: boolean
    placedCount: uint32
    pixels: c.Dictionary<uint32, Pixel>
}

export const PixelBoardStorage = {
    create(args: {
        owner: c.Address
        payoutWallet: c.Address
        width: uint16
        height: uint16
        price: coins
        isPaused: boolean
        placedCount: uint32
        pixels: c.Dictionary<uint32, Pixel>
    }): PixelBoardStorage {
        return {
            $: 'PixelBoardStorage',
            ...args
        }
    },
    fromSlice(s: c.Slice): PixelBoardStorage {
        return {
            $: 'PixelBoardStorage',
            owner: s.loadAddress(),
            payoutWallet: s.loadAddress(),
            width: s.loadUintBig(16),
            height: s.loadUintBig(16),
            price: s.loadCoins(),
            isPaused: s.loadBoolean(),
            placedCount: s.loadUintBig(32),
            pixels: c.Dictionary.load<uint32, Pixel>(c.Dictionary.Keys.BigUint(32), createDictionaryValue<Pixel>(Pixel.fromSlice, Pixel.store), s),
        }
    },
    store(self: PixelBoardStorage, b: c.Builder): void {
        b.storeAddress(self.owner);
        b.storeAddress(self.payoutWallet);
        b.storeUint(self.width, 16);
        b.storeUint(self.height, 16);
        b.storeCoins(self.price);
        b.storeBit(self.isPaused);
        b.storeUint(self.placedCount, 32);
        b.storeDict<uint32, Pixel>(self.pixels, c.Dictionary.Keys.BigUint(32), createDictionaryValue<Pixel>(Pixel.fromSlice, Pixel.store));
    },
    toCell(self: PixelBoardStorage): c.Cell {
        return makeCellFrom<PixelBoardStorage>(self, PixelBoardStorage.store);
    }
}

/**
 > struct (0x70726963) SetPrice {
 >     price: coins
 > }
 */
export interface SetPrice {
    readonly $: 'SetPrice'
    price: coins
}

export const SetPrice = {
    PREFIX: 0x70726963,

    create(args: {
        price: coins
    }): SetPrice {
        return {
            $: 'SetPrice',
            ...args
        }
    },
    fromSlice(s: c.Slice): SetPrice {
        loadAndCheckPrefix32(s, 0x70726963, 'SetPrice');
        return {
            $: 'SetPrice',
            price: s.loadCoins(),
        }
    },
    store(self: SetPrice, b: c.Builder): void {
        b.storeUint(0x70726963, 32);
        b.storeCoins(self.price);
    },
    toCell(self: SetPrice): c.Cell {
        return makeCellFrom<SetPrice>(self, SetPrice.store);
    }
}

/**
 > struct (0x70617573) SetPaused {
 >     isPaused: bool
 > }
 */
export interface SetPaused {
    readonly $: 'SetPaused'
    isPaused: boolean
}

export const SetPaused = {
    PREFIX: 0x70617573,

    create(args: {
        isPaused: boolean
    }): SetPaused {
        return {
            $: 'SetPaused',
            ...args
        }
    },
    fromSlice(s: c.Slice): SetPaused {
        loadAndCheckPrefix32(s, 0x70617573, 'SetPaused');
        return {
            $: 'SetPaused',
            isPaused: s.loadBoolean(),
        }
    },
    store(self: SetPaused, b: c.Builder): void {
        b.storeUint(0x70617573, 32);
        b.storeBit(self.isPaused);
    },
    toCell(self: SetPaused): c.Cell {
        return makeCellFrom<SetPaused>(self, SetPaused.store);
    }
}

/**
 > struct (0x70617977) SetPayoutWallet {
 >     payoutWallet: address
 > }
 */
export interface SetPayoutWallet {
    readonly $: 'SetPayoutWallet'
    payoutWallet: c.Address
}

export const SetPayoutWallet = {
    PREFIX: 0x70617977,

    create(args: {
        payoutWallet: c.Address
    }): SetPayoutWallet {
        return {
            $: 'SetPayoutWallet',
            ...args
        }
    },
    fromSlice(s: c.Slice): SetPayoutWallet {
        loadAndCheckPrefix32(s, 0x70617977, 'SetPayoutWallet');
        return {
            $: 'SetPayoutWallet',
            payoutWallet: s.loadAddress(),
        }
    },
    store(self: SetPayoutWallet, b: c.Builder): void {
        b.storeUint(0x70617977, 32);
        b.storeAddress(self.payoutWallet);
    },
    toCell(self: SetPayoutWallet): c.Cell {
        return makeCellFrom<SetPayoutWallet>(self, SetPayoutWallet.store);
    }
}

/**
 > struct (0x77697468) Withdraw {
 >     amount: coins
 >     to: address
 > }
 */
export interface Withdraw {
    readonly $: 'Withdraw'
    amount: coins
    to: c.Address
}

export const Withdraw = {
    PREFIX: 0x77697468,

    create(args: {
        amount: coins
        to: c.Address
    }): Withdraw {
        return {
            $: 'Withdraw',
            ...args
        }
    },
    fromSlice(s: c.Slice): Withdraw {
        loadAndCheckPrefix32(s, 0x77697468, 'Withdraw');
        return {
            $: 'Withdraw',
            amount: s.loadCoins(),
            to: s.loadAddress(),
        }
    },
    store(self: Withdraw, b: c.Builder): void {
        b.storeUint(0x77697468, 32);
        b.storeCoins(self.amount);
        b.storeAddress(self.to);
    },
    toCell(self: Withdraw): c.Cell {
        return makeCellFrom<Withdraw>(self, Withdraw.store);
    }
}

// ————————————————————————————————————————————
//    class PixelBoard
//

interface ExtraSendOptions {
    bounce?: boolean                    // default: false
    sendMode?: SendMode                 // default: SendMode.PAY_GAS_SEPARATELY
    extraCurrencies?: c.ExtraCurrency   // default: empty dict
}

interface DeployedAddrOptions {
    workchain?: number                  // default: 0 (basechain)
    toShard?: { fixedPrefixLength: number; closeTo: c.Address }
    overrideContractCode?: c.Cell
}

function calculateDeployedAddress(code: c.Cell, data: c.Cell, options: DeployedAddrOptions): c.Address {
    const stateInitCell = beginCell().store(c.storeStateInit({
        code,
        data,
        splitDepth: options.toShard?.fixedPrefixLength,
        special: null,
        libraries: null,
    })).endCell();

    let addrHash = stateInitCell.hash();
    if (options.toShard) {
        const shardDepth = options.toShard.fixedPrefixLength;
        addrHash = beginCell()
            .storeBits(new c.BitString(options.toShard.closeTo.hash, 0, shardDepth))
            .storeBits(new c.BitString(stateInitCell.hash(), shardDepth, 256 - shardDepth))
            .endCell()
            .beginParse().loadBuffer(32);
    }

    return new c.Address(options.workchain ?? 0, addrHash);
}

export class PixelBoard implements c.Contract {
    static CodeCell = c.Cell.fromBase64('te6ccgECFgEAA2MAART/APSkE/S88sgLAQIBYgIDAgLOBAUCASAPEATZT4kZEw4FMA10nCH5gg1wsfwADDAJFw4uMCMCDXLCODk0scji4x7UTQ+kj6SNYf+gAx+JIkxwXy4GgE+gAwIMIA8uBpA8j6UhL6Us4B+gLOye1U4NcsI4MLq5zjAtcsI4MLy7zjAtcsI7tLo0SAYHCAkCASANDgL8MfiS+Jf4lQPTHzEg10nCX/LgZdMHAcBw8uBl0wcBwGLy4GXTBwHAOvLgZdMH0wcC8AKqAwHwAqAB0wfTBwLwAqoDAfACoAHTBwHAOvLgZfADAdMHAcA68uBlIMjOMckg2zwgwgCWgQDwu8MAkjBw4vLgZe1E0PpI+kjTD9MPCgsAWDHtRND6SPpI1h/6ANIAMfiSJccF8uBoBdcKAATI+lIT+lLOAfoCygDOye1UAD4x7UTQ+kj6SDH4kiLHBfLgaAL6SDAByPpS+lLOye1UAGqOKjHtRND6SDD4kscF8uBo+gD6SDAhwgDy4GrIz4UI+lIB+gJwzwtqyXH7AOAwhA8BxwDy9AAscAHQINdkmSDXSRKgAddM0OTXSaCrAgH++gDSANMf9AUi8tBnU7W5lVOkucMAkXDi8uBkUaWoUAugUwmAIPQOb6EgjhEB1DHTBzH6SDHTHzH6ANGqAJIxI+JR3b7y4GaTCqQK3wfIzBjLBxv6UhvLHyj6AkBGgCD0QwHI+lJSQPpSEssPF8sPUAX6AhTKAMsfE/QAye1UAQwAKKsAyM+FCBL6UgH6AnDPC2rJcfsAAE0IMIvlSDBOsMAkXDikqbQ4CDCYJUgwWfDAJFw4pSmn6YK4DDywGWAAqzTByHAao4SMdMHAcBw8uBl0wcBwGfy4GVx4CHAcI4SMdMHAcBu8uBl0wcBwGfy4GVy4AHAd44Z0wcBwGXy4GXTBwHAYvLgZdMHAcBw8uBlc+Aw8sBlgABG+KO9qJofSQYQCAUgREgIBWBMUABe1mH2omh9JBj9JBhAAKa029qJofSR9JGmH6Yf9AGkAa4WPwAGtr7/2omh9JH0kGOmH6Yf9AGmQGPoCqbHcyqkp3OGASRk4cXlwMighVCgCUCxAEHoHN9DHCrYQ6mmD/SRpj/0AaL+Q1QALCoohmHAYOEQ4KYAIIwgaoIJAFQAA');

    static Errors = {
        'Errors.OutOfBounds': 100,
        'Errors.InvalidImageComment': 101,
        'Errors.InsufficientValue': 102,
        'Errors.BoardPaused': 103,
        'Errors.NotOwner': 104,
        'Errors.InvalidPrice': 105,
        'Errors.InvalidWithdrawAmount': 106,
        'Errors.InvalidMessage': 65535,
    }

    readonly address: c.Address
    readonly init: { code: c.Cell, data: c.Cell } | undefined

    protected constructor(address: c.Address, init?: { code: c.Cell, data: c.Cell }) {
        this.address = address;
        this.init = init;
    }

    static fromAddress(address: c.Address) {
        return new PixelBoard(address);
    }

    static fromStorage(emptyStorage: {
        owner: c.Address
        payoutWallet: c.Address
        width: uint16
        height: uint16
        price: coins
        isPaused: boolean
        placedCount: uint32
        pixels: c.Dictionary<uint32, Pixel>
    }, deployedOptions?: DeployedAddrOptions) {
        const initialState = {
            code: deployedOptions?.overrideContractCode ?? PixelBoard.CodeCell,
            data: PixelBoardStorage.toCell(PixelBoardStorage.create(emptyStorage)),
        };
        const address = calculateDeployedAddress(initialState.code, initialState.data, deployedOptions ?? {});
        return new PixelBoard(address, initialState);
    }

    static createCellOfSetPrice(body: {
        price: coins
    }) {
        return SetPrice.toCell(SetPrice.create(body));
    }

    static createCellOfSetPaused(body: {
        isPaused: boolean
    }) {
        return SetPaused.toCell(SetPaused.create(body));
    }

    static createCellOfSetPayoutWallet(body: {
        payoutWallet: c.Address
    }) {
        return SetPayoutWallet.toCell(SetPayoutWallet.create(body));
    }

    static createCellOfWithdraw(body: {
        amount: coins
        to: c.Address
    }) {
        return Withdraw.toCell(Withdraw.create(body));
    }

    async sendDeploy(provider: ContractProvider, via: Sender, msgValue: coins, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: c.Cell.EMPTY,
            ...extraOptions
        });
    }

    async sendSetPrice(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        price: coins
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SetPrice.toCell(SetPrice.create(body)),
            ...extraOptions
        });
    }

    async sendSetPaused(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        isPaused: boolean
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SetPaused.toCell(SetPaused.create(body)),
            ...extraOptions
        });
    }

    async sendSetPayoutWallet(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        payoutWallet: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: SetPayoutWallet.toCell(SetPayoutWallet.create(body)),
            ...extraOptions
        });
    }

    async sendWithdraw(provider: ContractProvider, via: Sender, msgValue: coins, body: {
        amount: coins
        to: c.Address
    }, extraOptions?: ExtraSendOptions) {
        return provider.internal(via, {
            value: msgValue,
            body: Withdraw.toCell(Withdraw.create(body)),
            ...extraOptions
        });
    }

    async getOwner(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('owner', []));
        return r.readSlice().loadAddress();
    }

    async getPayoutWallet(provider: ContractProvider): Promise<c.Address> {
        const r = StackReader.fromGetMethod(1, await provider.get('payoutWallet', []));
        return r.readSlice().loadAddress();
    }

    async getConfig(provider: ContractProvider): Promise<[
        c.Address,
        c.Address,
        uint16,
        uint16,
        coins,
        boolean,
        uint32,
    ]> {
        const r = StackReader.fromGetMethod(7, await provider.get('config', []));
        return [
            r.readSlice().loadAddress(),
            r.readSlice().loadAddress(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBoolean(),
            r.readBigInt(),
        ];
    }

    async getPixel(provider: ContractProvider, x: uint16, y: uint16): Promise<[
        boolean,
        string,
        uint8,
        c.Address,
        uint32,
        coins,
        coins,
    ]> {
        const r = StackReader.fromGetMethod(7, await provider.get('pixel', [
            { type: 'int', value: x },
            { type: 'int', value: y },
        ]));
        return [
            r.readBoolean(),
            r.readSnakeString(),
            r.readBigInt(),
            r.readSlice().loadAddress(),
            r.readBigInt(),
            r.readBigInt(),
            r.readBigInt(),
        ];
    }
}
