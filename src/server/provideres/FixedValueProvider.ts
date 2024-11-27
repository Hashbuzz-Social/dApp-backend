export class FixedValueProvider<T extends string | number | boolean = string> {
    private value: T;

    constructor(value: T) {
        this.value = value;
    }

    get(): T {
        return this.value;
    }
}
