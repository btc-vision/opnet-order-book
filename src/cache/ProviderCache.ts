import { Provider } from '../lib/Provider';
import { Entry } from './Entry';
import { u256 } from 'as-bignum/assembly';
import { binarySearch, compareU256 } from './BinarySearch';

const cachedProvidersArray: Entry[] = new Array<Entry>();

/**
 * @function findProvider
 * @description Retrieves a Provider from the cache based on the u256 key.
 * @param {u256} subTick - The u256 key representing the Provider.
 * @returns {Provider | null} - The found Provider or null if not found.
 */
export function findProvider(subTick: u256): Provider | null {
    const index: i32 = binarySearch(cachedProvidersArray, subTick);
    if (index >= 0) {
        return cachedProvidersArray[index].provider;
    }
    return null;
}

/**
 * @function insertProvider
 * @description Inserts a new Provider into the sorted array.
 * @param {Entry} newEntry - The Entry to insert.
 */
export function insertProvider(newEntry: Entry): void {
    let low: i32 = 0;
    let high: i32 = cachedProvidersArray.length;

    while (low < high) {
        const mid: i32 = low + ((high - low) >> 1);
        const cmp: i32 = compareU256(cachedProvidersArray[mid].key, newEntry.key);
        if (cmp < 0) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    // Insert at position 'low'
    cachedProvidersArray[low] = newEntry;
}

/**
 * @function saveAllProviders
 * @description Saves all Providers in the cache.
 */
export function saveAllProviders(): void {
    for (let i: i32 = 0; i < cachedProvidersArray.length; i++) {
        cachedProvidersArray[i].provider.save();
    }
}
