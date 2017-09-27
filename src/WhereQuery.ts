import Query from './Query';

export class WhereQuery {
    public readonly key;
    public readonly logicalOperator: string;
    public readonly parent;
    constructor(parent: Query, key: string, logicalOperator: string = '$and') {
        this.parent = parent;
        this.logicalOperator = logicalOperator;
        this.key = key;
    }

    private set(operator: string, value: any) {
        return this.parent.where(this.key, operator, value, this.logicalOperator);
    }

    public get is() {
        return this;
    }

    public eq(value: boolean | number | string) {
        return this.set('$eq', value);
    }

    public exists(value: boolean = true) {
        return this.set('$exists', value);
    }

    public gt(value: number) {
        return this.set('$gt', value);
    }

    public gte(value: number) {
        return this.set('$gte', value);
    }

    public in(value: (boolean | string | number)[]) {
        return this.set('$in', value);
    }

    public lt(value: number) {
        return this.set('$lt', value);
    }

    public lte(value: number) {
        return this.set('$lte', value);
    }

    public ne(value: boolean | number | string) {
        return this.set('$ne', value);
    }

    public nin(value: (boolean | string | number)[]) {
        return this.set('$nin', value);
    }
}

export default WhereQuery;
