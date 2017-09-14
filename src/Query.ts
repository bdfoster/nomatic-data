import * as get from 'lodash.get';
import * as set from 'lodash.set';
import Record from './Record';
import * as merge from 'lodash.merge';
import {isNullOrUndefined} from "util";

export type QueryOperator = '$eq' | '$ne' | '$gt' | '$gte' | '$lt' | '$lte';

export class WhereQuery {
    public readonly key;
    public readonly logicalOperator: string;
    public readonly query;
    constructor(query: Query, key: string, logicalOperator: string) {
        this.query = query;
        this.logicalOperator = logicalOperator;
        this.key = key;
    }

    private set(operator: string, value: any) {
        return this.query.where(this.key, operator, value, this.logicalOperator);
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

    public in(value: Array<boolean | string | number>) {
        return this.set('$in', value);
    }

    public lt(value: number) {
        return this.set('$lt', value);
    }

    public lte(value: number) {
        return this.set('$lte', value);
    }

    public ne(value: boolean | number | string) {
        return this.set('$ne', value)
    }

    public nin(value: Array<boolean | string | number>) {
        return this.set('$nin', value);
    }
}


export class Query {
    static COMPARISON_OPERATORS = [
        '$eq',
        '$gt',
        '$gte',
        '$in',
        '$lt',
        '$lte',
        '$ne',
        '$nin'
    ];

    static ELEMENT_OPERATORS = [
        '$exists'
    ];

    static LOGICAL_OPERATORS = [
        '$and',
        '$or'
    ];

    private _run: (query: object) => Promise<Record[]>;
    public data;

    constructor(run?: (query: object) => Promise<Record[]>) {
        this.data = {
            limit: 0,
            skip: 0,
            $query: {},
            $sort: [],
            $fields: []
        };

        this._run = run || function(query) {
            return Promise.resolve([]);
        };
    }

    public and(key: string) {
        return this.where(key);
    }

    public limit(value: number) {
        this.data.limit = value;
        return this;
    }

    public or(key: string) {
        if (!this.data.$query.$and) {
            throw new Error('Cannot use `or()` without using `where()` first');
        }

        if (!this.data.$query.$or) {
            this.data.$query.$or = [];
        }

        this.data.$query.$or.push(this.data.$query.$and.pop());
        return new WhereQuery(this, key, '$or');
    }

    public run() {
        return this._run(this.data);
    }

    public skip(value: number) {
        this.data.skip = value;
        return this;
    }

    public sort(key: string | string[], direction?: string) {
        if (!direction) {
            direction = 'ASC';
        } else if (direction !== 'ASC' && direction !== 'DES') {
            throw new Error('Invalid sorting type: ' + direction);
        }


        if (typeof key === 'string') {
            this.data.orderBy.push([key, direction]);
            return this;
        } else {
            for (const i in key) {
                this.sort(key[i][0], key[i][1] || direction);
            }
        }

        return this;
    }

    public toJSON() {
        return this.data;
    }

    public where(key: string, operator?: string, value?: any, logicalOperator?: string) {
        if (key && !operator) {
            return new WhereQuery(this, key, null);
        }

        if (Query.COMPARISON_OPERATORS.indexOf(operator) === -1 && Query.ELEMENT_OPERATORS.indexOf(operator) === -1) {
            throw new Error('Invalid operator: ' + operator);
        }

        if (!logicalOperator) {
            logicalOperator = '$and';
        } else if (Query.LOGICAL_OPERATORS.indexOf(logicalOperator) === -1) {
            throw new Error('Invalid logical operator: ' + logicalOperator);
        }

        if (!this.data.$query[logicalOperator]) {
            this.data.$query[logicalOperator] = [];
        }

        this.data.$query[logicalOperator].push({
            [key]: {
                [operator]: value
            }
        });

        return this;
    }
}

export default Query;