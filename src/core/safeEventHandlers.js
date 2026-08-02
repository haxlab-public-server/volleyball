module.exports = function wrapEventHandlers(handlers) {
    const wrapped = {};
    for (const [name, fn] of Object.entries(handlers)) {
        wrapped[name] = function (...args) {
            try {
                const result = fn.apply(this, args);
                if (result instanceof Promise) {
                    result.catch((err) => console.error(`Error in room.${name}:`, err));
                }
                return result;
            } catch (err) {
                console.error(`Error in room.${name}:`, err);
            }
        };
    }
    return wrapped;
};