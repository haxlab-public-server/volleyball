function createSitState({ state, Sits }) {
    const transitions = new Map([
        [Sits.NONE, new Set([Sits.NONE, Sits.FORMING, Sits.RANDOMIZE, Sits.GAME, Sits.TIMEOUT])],
        [Sits.FORMING, new Set([Sits.FORMING, Sits.CHOICE, Sits.NONE])],
        [Sits.CHOICE, new Set([Sits.CHOICE, Sits.GAME, Sits.NONE])],
        [Sits.RANDOMIZE, new Set([Sits.RANDOMIZE, Sits.GAME, Sits.NONE])],
        [Sits.GAME, new Set([Sits.GAME, Sits.NONE, Sits.TIMEOUT])],
        [Sits.TIMEOUT, new Set([Sits.TIMEOUT, Sits.NONE])]
    ]);

    function transitionTo(nextSit) {
        const currentSit = state.sit;
        const allowed = transitions.get(currentSit);

        if (!allowed || !allowed.has(nextSit)) {
            throw new Error(`Invalid sit transition: ${currentSit} -> ${nextSit}`);
        }

        state.sit = nextSit;
        return nextSit;
    }

    return { transitionTo };
}

module.exports = createSitState;
