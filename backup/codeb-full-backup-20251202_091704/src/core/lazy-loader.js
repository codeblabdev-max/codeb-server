/**
 * 레이지 로딩 모듈
 */

class LazyLoader {
    constructor() {
        this.cache = new Map();
    }

    async loadModule(modulePath) {
        if (this.cache.has(modulePath)) {
            return this.cache.get(modulePath);
        }

        try {
            const module = await import(modulePath);
            this.cache.set(modulePath, module);
            return module;
        } catch (error) {
            console.error(`모듈 로딩 실패: ${modulePath}`, error);
            throw error;
        }
    }

    async loadModules(modulePaths) {
        const modules = await Promise.all(
            modulePaths.map(path => this.loadModule(path))
        );
        return modules;
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new LazyLoader();