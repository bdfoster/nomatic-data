import * as merge from 'lodash.merge';
import {AsyncEventEmitter} from 'nomatic-events';
import {Adapter} from './adapters/index';
import Query from './Query';
import {Record, RecordData, RecordOptions, RecordValidateFunction, RecordVirtualProperties} from './Record';

export type MapperHookFunction = (record: Record) => void | Promise<void>;
export type MapperBeforeGetHookFunction = (id: string) => void | Promise<void>;
export type MapperValidateHookFunction = (record: Record, operation: MapperValidateHookOperation) => void | Promise<void>;
export type MapperValidateHookOperation = 'insert' | 'replace' | 'update';

export interface MapperOptions {
    adapter: Adapter;
    afterGet?: MapperHookFunction | MapperHookFunction[];
    afterInsert?: MapperHookFunction | MapperHookFunction[];
    afterUpdate?: MapperHookFunction | MapperHookFunction[];
    afterValidate?: MapperValidateHookFunction | MapperValidateHookFunction[];
    beforeGet?: MapperBeforeGetHookFunction | MapperBeforeGetHookFunction[];
    beforeInsert?: MapperHookFunction | MapperHookFunction[];
    beforeUpdate?: MapperHookFunction | MapperHookFunction[];
    beforeValidate?: MapperValidateHookFunction | MapperValidateHookFunction[];
    name: string;
    validate?: RecordValidateFunction;
    virtuals?: RecordVirtualProperties;
}

export class Mapper extends AsyncEventEmitter {
    public static hooksList: string[] = [
        'afterGet',
        'afterInsert',
        'afterUpdate',
        'afterValidate',
        'beforeGet',
        'beforeInsert',
        'beforeUpdate',
        'beforeValidate'
    ];

    private _validate: RecordValidateFunction;
    private _virtuals: RecordVirtualProperties;

    public readonly adapter: Adapter;
    public name: string;
    public readonly collection: string;

    /**
     * Hooks ordering:
     *  Operation(s)                    Order
     *  --------------------------------------------------------------------------------------------------
     *  find, findAll                   afterGet
     *  get, getAll                     beforeGet, afterGet
     *  insert,insertAll                beforeValidate, afterValidate, beforeInsert, afterInsert, afterGet
     *  replace, update                 beforeValidate, afterValidate, beforeUpdate, afterUpdate, afterGet
     *  --------------------------------------------------------------------------------------------------
     *
     * Hooks are called on each record, so getAll, findAll, and insertAll operations will call each hook for each
     * record.
     */
    constructor(options: MapperOptions) {
        super();
        this.adapter = options.adapter;
        this.name = options.name;
        this.collection = options.name;
        this._validate = options.validate;
        this._virtuals = options.virtuals || {};

        for (const namespace of Mapper.hooksList) {
            if (options[namespace]) {
                if (options[namespace] instanceof Array) {
                    for (const fn of options[namespace]) {
                        this.on(namespace, fn);
                    }
                } else {
                    this.on(namespace, options[namespace]);
                }
            }
        }
    }

    private async validate(record: Record, operation: string) {
        await this.emit('beforeValidate', record, operation);
        return record.validate().then( () => {
            return this.emit('afterValidate', record, operation);
        });
    }

    public createRecord(data: RecordData = {}): Record {
        const options: RecordOptions = {
            validate: this._validate,
            save: (record) => this.save(record),
            virtuals: this._virtuals
        };

        return new Record(options, data);
    }

    public async get(id: string): Promise<Record> {
        await this.emit('beforeGet', id);
        const response = await this.adapter.get(this.collection, id);
        const record = this.createRecord(response);
        await this.emit('afterGet', record);
        return record;
    }

    public async getAll(ids: string[]) {
        const promises = [];

        for (const i in ids) {
            promises.push(this.get(ids[i]));
        }

        return Promise.all(promises);
    }

    public find(): Query {
        return new Query((query) => {
           return this.findAll(query);
        });
    }

    public async findAll(query: Query | object): Promise<Record[]> {
        let q;

        if (!(query instanceof Query)) {
            q = new Query(null, query);
        } else {
            q = query;
        }

        const results = [];
        const response = await this.adapter.findAll(this.collection, q);

        for (const i in response) {
            const record = this.createRecord(response[i]);
            await this.emit('afterGet', record);
            results.push(record);
        }

        return results;
    }

    public async update(data: Record | RecordData, validate: boolean = true): Promise<Record> {
        let record;

        if (!(data instanceof Record)) {
            const old = await this.get(data.id);
            merge(old, data);
            record = old;
        } else {
            record = data;
        }

        if (validate) {
            try {
                await this.validate(record, 'update');
            } catch (error) {
                throw error;
            }
        }

        await this.emit('beforeUpdate', record);

        const result = await this.adapter.update(this.collection, record.id, record.serialize('save'));
        record.commit(result);
        await this.emit('afterUpdate', record);
        await this.emit('afterGet', record);
        return record;
    }

    public async save(record: Record, validate: boolean = true, force: boolean = false): Promise<Record> {
        if (record.id && record.rev) {
            if (record.changes().length === 0 && !force) {
                return this.get(record.id).then((response) => {
                    if (response.rev === record.rev) {
                        return record;
                    }

                    return this.update(record, validate);
                });
            }

            return this.update(record, validate);
        }

        return this.insert(record, validate);
    }

    public async load() {
        try {
            await this.adapter.ensureCollectionExists(this.collection);
            return this;
        } catch (error) {
            throw error;
        }
    }

    public async remove (data: RecordData | string): Promise<Record> {
        let response;

        if (typeof data === 'string') {
            response = await this.adapter.remove(this.collection, data);
        } else {
            response = await this.adapter.remove(this.collection, data.id);
        }

        return response;
    }

    public async replace (id: string, data: RecordData, validate: boolean = true, rev: string = null): Promise<Record> {
        const record = this.createRecord(Object.assign({}, data));

        if (validate) {
            try {
                await this.validate(record, 'replace');
            } catch (error) {
                throw error;
            }
        }

        await this.emit('beforeUpdate', record);

        return this.adapter.replace(this.collection, id, record.serialize('save'), rev).then(async (data) => {
            record.commit(data);
            await this.emit('afterUpdate', record);
            await this.emit('afterGet', record);
            return record;
        });
    }

    public async insert(data: Record | RecordData, validate: boolean = true): Promise<Record> {
        let record: Record;

        if (!(data instanceof Record)) {
            record = this.createRecord(data);
        } else {
            record = data;
        }

        if (validate) {
            try {
                await this.validate(record, 'insert');
            } catch (error) {
                throw error;
            }
        }

        await this.emit('beforeInsert', record);

        return this.adapter.insert(this.collection, record.serialize('save')).then(async (result) => {
            record.init(result);
            await this.emit('afterInsert', record);
            await this.emit('afterGet', record);
            return record;
        });
    }

    public async insertAll(records: (Record | RecordData)[], validate: boolean = true): Promise<Record[]> {
        const results = [];
        for (const record of records) {
            try {
                results.push(await this.insert(record, validate));
            } catch (error) {
                throw error;
            }
        }

        return results;
    }

    public truncate () {
        return this.adapter.truncateCollection(this.collection);
    }
}

export default Mapper;
