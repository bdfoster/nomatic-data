import * as Ajv from 'ajv';
import * as ajvAsync from 'ajv-async';
import {Database} from 'arangojs';
import {EventEmitter} from 'nomatic-events';
import {Adapter} from './adapters/index';
import AlreadyExistsError from './errors/AlreadyExistsError';
import ValidationError from './errors/ValidationError';
import Mapper, {MapperHookFunction, MapperOptions} from './Mapper';
import {RecordData, RecordVirtualProperties} from './Record';
import Record from './Record';
import Query from "./Query";

export interface ContainerMapperOptions {
    properties?: object;
    required?: Array<string>;
    additionalProperties?: boolean | object;
    virtuals?: RecordVirtualProperties;
    afterInsert?: MapperHookFunction | MapperHookFunction[];
    afterUpdate?: MapperHookFunction | MapperHookFunction[];
    beforeInsert?: MapperHookFunction | MapperHookFunction[];
    beforeUpdate?: MapperHookFunction | MapperHookFunction[];
}

export interface ContainerMappers {
    [key: string]: Mapper;
}


export interface ContainerOptions {
    adapter: Adapter;
    afterInsert?: MapperHookFunction | MapperHookFunction[];
    afterUpdate?: MapperHookFunction | MapperHookFunction[];
    beforeInsert?: MapperHookFunction | MapperHookFunction[];
    beforeUpdate?: MapperHookFunction | MapperHookFunction[];
    mappers: {
        [key: string]: ContainerMapperOptions;
    };
}

export default class Container extends EventEmitter {
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
                            message: 'should be an existing ' + mapper,
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
        const schema = {
            $async: true,
            type: 'object',
            properties: options.properties || {},
            required: options.required || [],
            additionalProperties: options.additionalProperties || true,

        };
        let validate;

        if (this.mappers.hasOwnProperty(name)) {
            throw new AlreadyExistsError();
        }

        this.validator.addSchema(schema, name);

        validate = async (data) => {
            const isValid = await this.validator.validate(name, data);

            if (!isValid) {
                const error = this.validator.errors[0];

                if (error.ajv) {
                    throw new ValidationError(error);
                }

                throw error;
            }

            return data;
        };

        const mapperOptions: MapperOptions = {
            adapter: this.adapter,
            name: name,
            validate: validate
        };

        for (const name of Mapper.hooksList) {
            if (options[name]) {
                mapperOptions[name] = options[name];
            }
        }

        this.mappers[name] = new Mapper(mapperOptions);

        for (const namespace of Mapper.hooksList) {
            this.mappers[name].on(namespace, (...data) => {
                this.emit(namespace, ...data, name);
            });
        }

        return this.mappers[name];
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

    public get(mapper: string, ids: string[]): Promise<Record> {
        return this.mappers[mapper].get(ids[0]);
    }

    public find(mapper: string): Query {
        return this.mappers[mapper].find();
    }

    public findAll(mapper: string, query: Query): Promise<Record[]> {
        return this.mappers[mapper].findAll(Query);
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