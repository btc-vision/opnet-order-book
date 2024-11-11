import { Tick } from './Tick';
import { StoredMapU256 } from '../stored/StoredMapU256';
import { u256 } from 'as-bignum/assembly';
import { TICK_NEXT_VALUE_POINTER } from './StoredPointers';

const tickValuePool = new StoredMapU256<u256, u256>(TICK_NEXT_VALUE_POINTER);

export class TickNode {
    public readonly tick: Tick;

    public _loadedNextTickNode: TickNode | null = null;

    constructor(tick: Tick) {
        this.tick = tick;
    }

    public get next(): TickNode | null {
        if (this._loadedNextTickNode !== null) {
            return this._loadedNextTickNode;
        }

        const nextId = tickValuePool.get(this.tick.tickId);

        if (nextId === null) {
            return null;
        }

        const nextTick: Tick = new Tick(nextId, u256.Zero);
        const loaded = nextTick.load();

        if (!loaded) {
            return null;
        }

        this._loadedNextTickNode = new TickNode(nextTick);
        return this._loadedNextTickNode;
    }

    public set next(value: TickNode | null) {
        if (value === null) {
            tickValuePool.set(this.tick.tickId, u256.Zero);
        } else {
            tickValuePool.set(this.tick.tickId, value.tick.tickId);
        }
    }
}
