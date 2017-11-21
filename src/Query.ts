import * as get from 'lodash.get';
import * as set from 'lodash.set';
import Record, {RecordData} from './Record';
import WhereQuery from './WhereQuery';

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

    static LOGIC_OPERATORS = [
        '$and',
        '$or'
    ];


    public data;
    public runHandler: (query: object) => Promise<RecordData[]>;

    constructor(runHandler?: (query: Query) => Promise<RecordData[]>, data?: object) {
        this.data = {
            $limit: 0,
            $skip: 0,
            $where: {}
        };

        this.runHandler = runHandler || function(query) {
            return Promise.resolve([]);
        };

        if (data) {
            this.parse(data);
        }
    }

    private parse(data, path?: string, logicOperator: string = '$and', key?: string) {
        if (!path) {
            this.data.$limit = data.$limit || 0;
            this.data.$skip = data.$skip || 0;

            if (data.$sort) {
                this.sort(data.$sort);
            }

            if (data.$fields) {
                this.fields(...data.$fields);
            }

            if (data.$where) {
                for (const key in data.$where) {
                    this.parse(data, key);
                }
            }

            return;
        }

        const parts = path.split('.');

        if (!key) {
            key = parts.join('.');
        }

        let value = get(data, '$where.' + path);

        if (value === undefined) {
            const altParts = path.split('.');
            let altOperation = '';
            let altPrefix = '';
            if (parts[(parts.length - 1)].startsWith('$')) {
                altOperation = `.${altParts.pop()}`;
            }

            if (parts[0].startsWith('$')) {
                altPrefix = `.${altParts.shift()}`;
            }

            const altPath = `${altPrefix}['${altParts.join('.')}']${altOperation}`;

            value = get(data, `$where${altPath}`);
        }

        if (!parts[(parts.length - 1)].startsWith('$')) {
            // Not an operator
            if (typeof value === 'object') {
                for (const i in value) {
                    this.parse(data, `${path}.${i}`, logicOperator, `${key}.${i}`);
                }
            } else {
                this[logicOperator.substr(1)](key).eq(value);
            }
        } else if (Query.COMPARISON_OPERATORS.indexOf(parts[(parts.length - 1)]) !== -1 || Query.ELEMENT_OPERATORS.indexOf(parts[(parts.length - 1)]) !== -1) {
            // Comparison or element operator
            const operator = parts.pop();
            key = key.substr(0, (key.length - operator.length - 1));
            this[logicOperator.substr(1)](key)[operator.substr(1)](value);
        } else if (Query.LOGIC_OPERATORS.indexOf(parts[(parts.length - 1)]) !== -1) {
            logicOperator = parts.pop();

            for (let i = 0; i < value.length; i++) {
                for (const j in value[i]) {
                    if (parts.length === 0) {
                        key = j;
                    } else {
                        key = parts.join('.') + `.${j}`;
                    }

                    this.parse(data, `${path}[${i}].${j}`, logicOperator, key);
                }
            }
        } else {
            throw new Error('Cannot parse ' + value + ' in ' + path);
        }
    }

    public add(key: string, operator?: string, value?: any, logicalOperator?: string) {
        if (Query.COMPARISON_OPERATORS.indexOf(operator) === -1 && Query.ELEMENT_OPERATORS.indexOf(operator) === -1) {
            throw new Error('Invalid operator: ' + operator);
        }

        if (!logicalOperator) {
            logicalOperator = '$and';
        } else if (Query.LOGIC_OPERATORS.indexOf(logicalOperator) === -1) {
            throw new Error('Invalid logical operator: ' + logicalOperator);
        }

        if (!this.data.$where[logicalOperator]) {
            this.data.$where[logicalOperator] = [];
        }

        this.data.$where[logicalOperator].push({
            [key]: {
                [operator]: value
            }
        });

        return this;
    }

    public and(key: string) {
        return this.where(key);
    }

    public fields(...fields: (string | string[])[]) {
        if (!this.data.$fields) {
            this.data.$fields = [];
        }

        for (const i in fields) {
            if (fields[i] instanceof Array) {
                this.fields(...fields[i]);
            } else {
                if (this.data.$fields.indexOf(fields[i]) === -1) {
                    this.data.$fields.push(fields[i]);
                }
            }
        }

        return this;
    }

    public limit(value: number) {
        this.data.$limit = value;
        return this;
    }

    public or(key: string) {
        if (!this.data.$where.$and) {
            throw new Error('Cannot use `or()` without using `where()` first');
        }

        if (!this.data.$where.$or) {
            this.data.$where.$or = [];
        }

        this.data.$where.$or.push(this.data.$where.$and.pop());
        return new WhereQuery(this, key, '$or');
    }

    public run() {
        return this.runHandler(this);
    }

    public skip(value: number) {
        this.data.$skip = value;
        return this;
    }

    public sort(key: string | any[], order: number = 1) {
        if (order === 0) {
            throw new Error('Invalid sorting order: ' + order);
        }

        if (!this.data.$sort) {
            this.data.$sort = [];
        }

        if (typeof key === 'string') {
            order = order > 0 ? 1 : -1;
            this.data.$sort[this.data.$sort.length] = [key, order];
            return this;
        }

        for (const i in key) {
            this.sort(key[i][0], key[i][1]);
        }

        return this;
    }

    public toJSON() {
        return this.data;
    }

    public where(key: string, operator?: string, value?: any, logicalOperator?: string) {
        return new WhereQuery(this, key, null);
    }
}

export default Query;
