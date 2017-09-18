import {EventEmitter} from 'nomatic-events';
import {RecordData} from "../Record";
import Query from "../Query";

export interface AdapterOptions {
    name: string;
    maxListeners?: number;
}

export abstract class Adapter extends EventEmitter {
    private _name: string;

    constructor (options: AdapterOptions) {
        super(options.maxListeners || 0);
        this.name = options.name;
    }

    public get name () {
        return this._name;
    }

    public set name (name: string) {
        this._name = name;
    }

    /**
     * Create a collection to store records.
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    public abstract createCollection (name: string): Promise<boolean>;

    /**
     * Ensure that a collection exists. This method must be guaranteed not to throw if the collection already
     * exists.
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    public abstract ensureCollectionExists (name: string): Promise<boolean>;

    /**
     * Drop a collection.
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    public abstract dropCollection (name: string): Promise<boolean>;

    public abstract get (collection: string, id: string): Promise<RecordData>;

    /**
     * Get the name of each collection already defined.
     * @returns {Promise<string[]>}
     */
    public abstract getCollectionNames (): Promise<string[]>;

    public find(collection: string, query?: object | Query) {
        if (!query) {
            return new Query(null);
        } else if (query instanceof Query) {
            return this.findAll(collection, query);
        } else {
            return this.findAll(collection, new Query(null, query));
        }
    }

    public abstract findAll (collection: string, query?: Query): Promise<RecordData[]>;

    public abstract insert (collection: string, data: RecordData): Promise<RecordData>;

    public abstract insertAll (collection: string, data: RecordData[]): Promise<RecordData[]>;

    /**
     * Establish a connection and/or do anything needed in order to accept queries.
     * @returns {Promise<boolean>}
     */
    public load (): Promise<boolean> {
        return Promise.resolve(true);
    }

    public abstract remove (collection: string, id: string): Promise<RecordData>;

    public abstract replace(collection: string, id: string, data: RecordData, rev?: string): Promise<RecordData>;

    /**
     * Remove all records from the collection, but keep the collection itself and all
     * related settings.
     * @returns {Promise<boolean>}
     */
    public abstract truncateCollection (name: string): Promise<boolean>;

    public abstract update (collection: string, id: string, data: RecordData): Promise<RecordData>;
}

export abstract class DatabaseAdapter extends Adapter {
    constructor (options) {
        super(options);
    }

    public abstract createDatabase (name?: string): Promise<boolean>;

    public abstract ensureDatabaseExists (name?: string): Promise<boolean>;

    public abstract dropDatabase(name: string);

    public abstract getDatabaseNames (): Promise<string[]>;

    public abstract truncateDatabase (name?: string): Promise<boolean>;
}
