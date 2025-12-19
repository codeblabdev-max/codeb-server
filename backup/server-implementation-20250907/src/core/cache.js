/**
 * 메모리 효율적 캐싱 시스템
 */

const cache = new WeakMap();
const stringCache = new Map();

class MemoryEfficientCache {
    constructor() {
        this.objectCache = new WeakMap();
        this.stringCache = new Map();
        this.maxStringCacheSize = 100; // 최대 100개 항목
    }

    set(key, value) {
        if (typeof key === 'object') {
            this.objectCache.set(key, value);
        } else {
            // 문자열 캐시 크기 제한
            if (this.stringCache.size >= this.maxStringCacheSize) {
                const firstKey = this.stringCache.keys().next().value;
                this.stringCache.delete(firstKey);
            }
            this.stringCache.set(key, value);
        }
    }

    get(key) {
        if (typeof key === 'object') {
            return this.objectCache.get(key);
        } else {
            return this.stringCache.get(key);
        }
    }

    has(key) {
        if (typeof key === 'object') {
            return this.objectCache.has(key);
        } else {
            return this.stringCache.has(key);
        }
    }

    clear() {
        this.stringCache.clear();
        // WeakMap은 자동으로 가비지 컬렉션됨
    }
}

module.exports = new MemoryEfficientCache();