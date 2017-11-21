import * as Ajv from 'ajv';
import * as ajvAsync from 'ajv-async';
import {AsyncEventEmitter} from 'nomatic-events';
import {Adapter} from './adapters/index';
import ValidationError from './errors/ValidationError';
import Mapper, {
    MapperBeforeGetHookFunction,
    MapperHookFunction, MapperOptions, MapperValidateHookFunction,
    MapperValidateHookOperation
} from './Mapper';
import Query from './Query';
import Record, {RecordData, RecordVirtualProperties} from './Record';

export type ContainerBeforeGetHookFunction = (mapper: string, id: string) => void | Promise<void>;
export type ContainerHookFunction = (mapper: string, record: Record) => void | Promise<void>;
export type ContainerValidateHookFunction = (mapper: string, record: Record, operation: MapperValidateHookOperation) => void | Promise<void>;

export interface ContainerMapperOptions {
    properties?: object;
    required?: string[];
    additionalProperties?: boolean | object;
    virtuals?: RecordVirtualProperties;
    afterGet?: MapperHookFunction | MapperHookFunction[];
    afterInsert?: MapperHookFunction | MapperHookFunction[];
    afterUpdate?: MapperHookFunction | MapperHookFunction[];
    afterValidate?: MapperValidateHookFunction | MapperValidateHookFunction[];
    beforeGet?: MapperBeforeGetHookFunction | MapperBeforeGetHookFunction[];
    beforeInsert?: MapperHookFunction | MapperHookFunction[];
    beforeUpdate?: MapperHookFunction | MapperHookFunction[];
    beforeValidate?: MapperValidateHookFunction | MapperValidateHookFunction[];
}

export interface ContainerMappers {
    [key: string]: Mapper;
}


export interface ContainerOptions {
    adapter: Adapter;
    afterGet?: ContainerHookFunction | ContainerHookFunction[];
    afterInsert?: ContainerHookFunction | ContainerHookFunction[];
    afterUpdate?: ContainerHookFunction | ContainerHookFunction[];
    afterValidate?: ContainerValidateHookFunction | ContainerValidateHookFunction[];
    beforeGet?: ContainerBeforeGetHookFunction | ContainerBeforeGetHookFunction[];
    beforeInsert?: ContainerHookFunction | ContainerHookFunction[];
    beforeUpdate?: ContainerHookFunction | ContainerHookFunction[];
    beforeValidate?: ContainerValidateHookFunction | ContainerValidateHookFunction[];

    mappers: {
        [key: string]: ContainerMapperOptions;
    };
}

export class Container extends AsyncEventEmitter {
    private _isLoaded: boolean;
    private _isLoading: boolean;
    public readonly mappers: ContainerMappers;
    public readonly adapter: Adapter;
    public readonly validator;

    constructor(options: ContainerOptions) {
        super();
        this.mappers = {};
        this.adapter = options.adapter;
        this._isLoaded = false;
        this._isLoading = false;

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

        this.validator = ajvAsync(Ajv({
            coerceTypes: false,
            allErrors: false,
            useDefaults: true
        }));

        this.validator.addKeyword('mapper', {
            async: true,
            type: 'string',
            errors: true,
            validate: async (mapper, id, schema, path) => {
                return this.mappers[mapper].get(id).then((record) => {
                    return (record.id === id);
                }).catch((error) => {
                    if (error.name === 'NotFoundError') {
                        throw new ValidationError({
                            keyword: 'mapper',
                            message: 'should reference an existing record in "' + mapper + '" collection',
                            path: path
                        });
                    }

                    throw error;
                });
            }
        });

        if (options.mappers) {
            for (const mapper in options.mappers) {
                this.defineMapper(mapper, options.mappers[mapper]);
            }
        }
    }

    public get isLoaded() {
        return this._isLoaded;
    }

    public get isLoading() {
        return this._isLoading;
    }

    private defineMapper(name: string, options: ContainerMapperOptions = {}) {
        const schema = this.normalizeSchema({
            $async: true,
            type: 'object',
            properties: options.properties || {},
            required: options.required || [],
            additionalProperties: options.additionalProperties || true,
        });

        const validate = this.validator.compile(schema);

        const validateRunner = (data) => {
            return validate(data).then((data) => {
                return data;
            }).catch((error) => {
                if (error.ajv) {
                    throw new ValidationError(error.errors[0]);
                }

                throw error;
            });
        };



        const mapperOptions: MapperOptions = {
            adapter: this.adapter,
            name: name,
            validate: validateRunner,
            virtuals: options.virtuals
        };

        for (const hookName of Mapper.hooksList) {
            if (options[hookName]) {
                mapperOptions[hookName] = options[name];
            }
        }

        this.mappers[name] = new Mapper(mapperOptions);

        for (const namespace of Mapper.hooksList) {
            this.mappers[name].on(namespace, (...data) => {
                return this.emit(namespace, name, ...data);
            });
        }

        return this.mappers[name];
    }

    private normalizeSchema(schema: object) {
        if (schema.hasOwnProperty('properties')) {
            for (const key of Object.keys(schema['properties'])) {
                const child = schema['properties'][key];

                if (!schema.hasOwnProperty('required') || schema['required'].indexOf(key) === -1) {
                    if (child.hasOwnProperty('type')) {
                        if (child['type'] === 'object') {
                            this.normalizeSchema(child);
                        }

                        child['type'] = [child['type'], 'null'];
                    }
                }
            }
        }

        return schema;
    }

    public createRecord(mapper: string, data: RecordData): Record {
        return this.mappers[mapper].createRecord(data || null);
    }

    public insert(mapper: string, data: RecordData): Promise<Record> {
        return this.mappers[mapper].insert(data);
    }

    public insertAll(mapper: string, data: RecordData[]): Promise<Record[]> {
        return this.mappers[mapper].insertAll(data);
    }

    public get(mapper: string, id: string): Promise<Record> {
        return this.mappers[mapper].get(id);
    }

    public getAll(mapper: string, ids: string[]): Promise<Record[]> {
        return this.mappers[mapper].getAll(ids);
    }

    public find(mapper: string): Query {
        return this.mappers[mapper].find();
    }

    public findAll(mapper: string, query: Query | object): Promise<Record[]> {
        return this.mappers[mapper].findAll(query);
    }

    public load() {
        if (this._isLoaded) {
            return Promise.resolve(this);
        }

        if (this._isLoading) {
            return new Promise((resolve) => {
                this.on('open', (self) => {
                    resolve(self);
                });
            });
        }

        this._isLoading = true;

        return this.adapter.load().then(() => {
            const results = [];

            for (const mapper in this.mappers) {
                results.push(this.mappers[mapper].load());
            }

            return Promise.all(results).then(() => {
                this.emit('open', this);
                this._isLoaded = true;
                this._isLoading = false;
                return this;
            });
        });
    }

    public update(mapper: string, id: string, data: object): Promise<Record> {
        data['id'] = id;
        return this.mappers[mapper].update(data);
    }

    public remove(mapper: string, data: string | RecordData): Promise<Record> {
        return this.mappers[mapper].remove(data);
    }

    public replace(mapper: string, id: string, data: RecordData, validate: boolean = true, rev: string = null): Promise<Record> {
        return this.mappers[mapper].replace(id, data, validate, rev);
    }

    public truncate(mapper: string) {
        return this.mappers[mapper].truncate();
    }
}

export default Container;
