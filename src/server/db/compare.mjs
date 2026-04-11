export const normalizeForCompare = (value) => JSON.parse(JSON.stringify(value ?? null));

export const comparePayloads = (left, right) => {
    const a = JSON.stringify(normalizeForCompare(left));
    const b = JSON.stringify(normalizeForCompare(right));
    return {
        equal: a === b,
        left: a,
        right: b
    };
};
