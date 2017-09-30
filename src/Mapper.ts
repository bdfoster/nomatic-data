import {Database, DocumentCollection, Graph} from 'arangojs';
import * as merge from 'lodash.merge';
import {EventEmitter} from 'nomatic-events';
import {Adapter} from './adapters/index';
import Query from './Query';
import {Record, RecordData, RecordOptions, RecordValidateFunction, RecordVirtualProperties} from './Record';

export type MapperHookFunction = (record: Record) => void;

export interface MapperOptions {
    adapter: Adapter;
    afterInsert?: MapperHookFunction | MapperHookFunction[];
    afterUpdate?: MapperHookFunction | MapperHookFunction[];
    beforeInsert?: MapperHookFunction | MapperHookFunction[];
    beforeUpdate?: MapperHookFunction | MapperHookFunction[];
    name: string;
    validate?: RecordValidateFunction;
    virtuals?: RecordVirtualProperties;
}

export class Mapper extends EventEmitter {
    static hooksList: string[] = [
        'afterInsert',
        'afterUpdate',
        'beforeInsert',
        'beforeUpdate'
    ];

    private _validate: RecordValidateFunction;
    private _virtuals: RecordVirtualProperties;

    public readonly adapter: Adapter;
    public name: string;
    public readonly collection: string;

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

    public createRecord(data: RecordData = {}): Record {
        const options: RecordOptions = {
            validate: this._validate,
            save: (record) => this.save(record),
            virtuals: this._virtuals
        };

        return new Record(options, data);
    }

    public async get(id: string): Promise<Record> {
        const response = await this.adapter.get(this.collection, id);
        return this.createRecord(response);
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
            results.push(this.createRecord(response[i]));
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
                await record.validate();
            } catch (error) {
                throw error;
            }
        }

        this.emit('beforeUpdate', record);

        const result = await this.adapter.update(this.collection, record.id, record.serialize('save'));
        record.commit(result);
        this.emit('afterUpdate', record);
        return record;
    }

    public async save(record: Record, validate: boolean = true): Promise<Record> {
        if (record.id && record.rev) {
            if (record.changes().length === 0) {
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
                await record.validate();
            } catch (error) {
                throw error;
            }
        }

        this.emit('beforeUpdate', record);

        return await this.adapter.replace(this.collection, id, record.serialize('save'), rev).then((data) => {
            record.commit(data);
            this.emit('afterUpdate', record);
            return record;
        });
    }

    public async insert(data: Record | RecordData, validate: boolean = true): Promise<Record> {
        let record;

        if (!(data instanceof Record)) {
            record = this.createRecord(data);
        } else {
            record = data;
        }

        if (validate) {
            try {
                await record.validate();
            } catch (error) {
                throw error;
            }
        }

        this.emit('beforeInsert', data);

        return await this.adapter.insert(this.collection, record.serialize('save')).then((result) => {
            record.init(result);
            this.emit('afterInsert', record);
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
