// binarySearch.ts
import { Entry } from './Entry';
import { u256 } from 'as-bignum/assembly';

/**
 * @function compareU256
 * @description Compares two u256 values.
 * @param {u256} a - First u256 value.
 * @param {u256} b - Second u256 value.
 * @returns {i32} - Comparison result (-1, 0, 1).
 */
export function compareU256(a: u256, b: u256): i32 {
    if (u256.lt(a, b)) return -1;
    if (u256.gt(a, b)) return 1;
    return 0;
}

/**
 * @function binarySearch
 * @description Performs a binary search on a sorted array of Entries.
 * @param {Array<Entry>} array - The sorted array to search.
 * @param {u256} key - The u256 key to search for.
 * @returns {i32} - The index of the found Entry or -1 if not found.
 */
export function binarySearch(array: Array<Entry>, key: u256): i32 {
    let low: i32 = 0;
    let high: i32 = array.length - 1;

    while (low <= high) {
        const mid: i32 = low + ((high - low) >> 1);
        const cmp: i32 = compareU256(array[mid].key, key);

        if (cmp === 0) {
            return mid;
        } else if (cmp < 0) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return -1; // Not found
}
