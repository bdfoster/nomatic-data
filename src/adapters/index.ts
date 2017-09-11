import {EventEmitter} from 'nomatic-events';

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

    /**
     * Get the name of each collection already defined.
     * @returns {Promise<string[]>}
     */
    public abstract getCollectionNames (): Promise<string[]>;

    /**
     * Establish a connection and/or do anything needed in order to accept queries.
     * @returns {Promise<boolean>}
     */
    public load (): Promise<boolean> {
        return Promise.resolve(true);
    }

    /**
     * Remove all records from the collection, but keep the collection itself and all
     * related settings.
     * @returns {Promise<boolean>}
     */
    public abstract truncateCollection (): Promise<boolean>;
}

export abstract class DatabaseAdapter extends Adapter {
    constructor (options) {
        super(options);
    }

    public abstract createDatabase (name?: string): Promise<boolean>;

    public abstract ensureCollectionExists (name?: string): Promise<boolean>;

    public abstract getDatabaseNames (): Promise<boolean>;

    public abstract truncateDatabase (name?: string): Promise<boolean>;
}