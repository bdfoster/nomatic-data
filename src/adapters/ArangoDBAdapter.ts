import {Database} from 'arangojs';
import * as omit from 'lodash.omit';
import AdapterError from '../errors/AdapterError';
import AlreadyExistsError from '../errors/AlreadyExistsError';
import AssertionError from '../errors/AssertionError';
import NotFoundError from '../errors/NotFoundError';
import {Filter} from '../index';
import {RecordData} from '../Record';
import {AdapterOptions, DatabaseAdapter} from './index';
import {isNull, inspect} from 'util';

export interface ArangoDBAdapterOptions extends AdapterOptions {
    host: string;
    port: number;
    user: string;
    password: string;
}

export class ArangoDBAdapter extends DatabaseAdapter {
    public readonly client: Database;

    constructor(options: ArangoDBAdapterOptions) {
        super(options);

        const url = 'http://' + options.user + ':' + options.password + '@' + options.host + ':'
            + options.port;

        this._user = options.user;
        this._password = options.password;

        this.client = new Database({
            url: url,
            databaseName: options.name
        });

        this.name = options.name;
    }

    public get name() {
        return this.client['name'];
    }

    public set name(name: string) {
        if (!this.client) {
            return;
        }

        this.client.useDatabase(name);
    }

    private _password: string;

    public set password(password: string) {
        this._password = password;
        this.client['useBasicAuth'](this._user, this._password);
    }

    private _user: string;

    public get user() {
        return this._user;
    }

    public set user(user: string) {
        this._user = user;
        this.client['useBasicAuth'](this._user, this._password);
    }

    public createCollection(collection: string) {
        if (this.name === '_system') {
            return Promise.reject(new Error('Cannot create a collection on ' + this.name + ' database: ' + collection));
        }

        return this.client.collection(collection).create({
            waitForSync: true
        }).then(() => {
            return true;
        }).catch((error) => {
            if (error.name !== 'ArangoError' || error.errorNum !== 1207) {
                this.handleError(error);
            }

            return false;
        });
    }

    public createDatabase(database: string = null): Promise<boolean> {
        if (!database) {
            database = this.name;
        }

        const currentDatabaseName = this.name;
        this.name = '_system';

        return this.client.createDatabase(database, [
            {
                username: this.user
            }
        ]).then(() => {
            this.name = currentDatabaseName;
            return true;
        }).catch((error) => {
            this.name = currentDatabaseName;

            if (error.name !== 'ArangoError' || error.errorNum !== 1207) {
                this.handleError(error);
            }

            return false;
        });
    }

    public decode(collection: string, data: object): RecordData {
        if (data['_id']) {
            delete data['_id'];
        }

        if (data['_key']) {
            data['id'] = data['_key'];
            delete data['_key'];
        }

        if (data['_rev']) {
            data['rev'] = data['_rev'];
            delete data['_rev'];
        }

        return data;
    }

    public async dropCollection(collection: string): Promise<boolean> {
        if (collection.startsWith('_')) {
            throw new Error('Cannot delete a system collection');
        }

        try {
            await this.client.collection(collection).drop();
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    public async dropDatabase(database: string = this.name): Promise<boolean> {
        if (database.startsWith('_')) {
            throw new Error('Cannot delete a system database');
        }

        const currentDatabaseName = this.name;
        this.name = '_system';

        try {
            await this.client.dropDatabase(database);
            this.name = currentDatabaseName;
            return true;
        } catch (error) {
            this.name = currentDatabaseName;
            this.handleError(error);
            return false;
        }
    }

    public encode(collection: string, data: RecordData): object {
        if (data.hasOwnProperty('id')) {
            if (!(isNull(data.id))) {
                data._id = collection + '/' + data.id;
                data._key = data.id;
            }
            delete data.id;
        }



        if (data.hasOwnProperty('rev')) {
            if (!(isNull(data.rev))) {
                data._rev = data.rev;
            }

            delete data.rev;
        }

        return data;
    }

    public async ensureCollectionExists(collection: string): Promise<boolean> {
        return this.createCollection(collection);
    }

    public ensureDatabaseExists(database: string = this.name): Promise<boolean> {
        return this.createDatabase(database);
    }

    public async findAll(collection: string, filter: Filter = {}): Promise<RecordData[]> {
        const example = omit(filter, ['skip', 'limit']);

        if (Object.keys(example).length > 0) {

            return this.findAllByExample(collection, example, filter.skip, filter.limit).catch((error) => {
                if (error.name === 'ArangoError' && error.code === 404) {
                    return [];
                }

                this.handleError(error);
                return [];
            });
        }

        const results = [];

        try {
            const cursor = await this.client.collection(collection).all({
                skip: filter.skip,
                limit: filter.limit
            });

            await cursor.each((data: RecordData) => {
                results.push(this.decode(collection, data));
            });

            return results;
        } catch (error) {
            this.handleError(error);
            return [];
        }
    }

    public async findAllByExample(collection: string, data: RecordData, skip?: number, limit?: number): Promise<RecordData[]> {
        const results = [];

        try {
            const cursor = await this.client.collection(collection).byExample(this.encode(collection, data), {
                skip: skip,
                limit: limit
            });

            await cursor.each((data: object) => {
                results.push(this.decode(collection, data));
            });

            return results;
        } catch (error) {
            this.handleError(error);
            return [];
        }
    }

    public async get(collection: string, id: string): Promise<RecordData> {
        try {
            const response = await this.client.collection(collection).document(id);
            return this.decode(collection, response);
        } catch (error) {
            this.handleError(error);
            return {};
        }
    }

    public async getCollectionNames(database: string = this.name): Promise<string[]> {
        const list = [];

        const currentDatabase = this.name;
        this.name = database;

        try {
            const response = await this.client.listCollections(true);
            for (const collection of response) {
                list.push(collection['name']);
            }
            this.name = currentDatabase;
            return list;
        } catch (error) {
            this.name = currentDatabase;
            this.handleError(error);
            return [];
        }
    }

    public getDatabaseNames(): Promise<string[]> {
        return this.client.listDatabases().then((list) => {
            if (!list || !(list instanceof Array)) {
                list = [];
            }

            return list;
        }).catch((error) => {
            if (error.name === 'ArangoError' && error['errorNum'] === 1228 && this.name !== '_system') {
                const currentDatabase = this.name;
                this.name = '_system';
                return this.getDatabaseNames().then((list) => {
                    this.name = currentDatabase;
                    return list;
                });
            }

            this.handleError(error);
            return [];
        });
    }

    public async insert(collection: string, data: RecordData): Promise<RecordData> {
        data = Object.assign({}, data);
        try {
            const response = await this.client.collection(collection).save(this.encode(collection, data), {
                returnNew: true,
                waitForSync: true
            });

            data = this.decode(collection, response.new);
            return data;

        } catch (error) {
            this.handleError(error, collection);
            return {};
        }
    }

    public insertAll(collection: string, data: RecordData[]): Promise<RecordData[]> {
        const promises = [];

        for (const i in data) {
            promises.push(this.insert(collection, data[i]));
        }

        return Promise.all(promises);
    }

    public async remove(collection: string, data: string | RecordData): Promise<RecordData> {
        let id: string;

        const options = {
            waitForSync: true,
            policy: 'error',
            returnOld: true
        };

        if (typeof data === 'string') {
            id = data;
        } else {
            id = data.id;

            if (data.rev) {
                options['rev'] = data['rev'];
            }
        }

        try {
            const response = await this.client.collection(collection).remove(id, {
                waitForSync: true,
                policy: 'error',
                returnOld: true
            });

            return this.decode(collection, response.old);
        } catch (error) {
            this.handleError(error);
            return {};
        }
    }

    public async replace(collection: string, id: string, data: RecordData, rev: string = null) {
        data = Object.assign({}, data);
        const options = {
            waitForSync: true,
            policy: 'error',
            returnNew: true
        };

        if (rev) {
            options['rev'] = rev;
        }

        try {
            const response = await this.client.collection(collection).replace(id, this.encode(collection, data), options);
            return this.decode(collection, response.new);
        } catch (error) {
            this.handleError(error);
            return {};
        }
    }

    public async truncateCollection(collection: string): Promise<boolean> {
        try {
            await this.client.collection(collection).truncate();
            return true;
        } catch (error) {
            this.handleError(error, collection);
            return false;
        }
    }

    public async truncateDatabase() {
        try {
            await this.client.truncate();
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    public async update(collection: string, id: string, data: RecordData) {
        data = Object.assign({}, data);
        try {
            const options = {
                waitForSync: true,
                keepNull: false,
                policy: 'error',
                returnNew: true
            };

            data = this.encode(collection, data);

            if (data['_rev']) {
                options['rev'] = data['_rev'];
            }

            const response = await this.client.collection(collection).update(id, data, options);

            return this.decode(collection, response.new);
        } catch (error) {
            if (error.name === 'ArangoError' && error['errorNum'] === 1200) {
                // Revision of record to be updated does not match copy in database
                throw new AssertionError('rev', data['_rev'], 'something different');
            }

            this.handleError(error);
            return {};
        }
    }

    public load(): Promise<boolean> {
        return this.ensureDatabaseExists();
    }

    private handleError(error: Error, ...data: any[]) {
        switch (error.name) {
            case 'ArangoError':
                switch (error['errorNum']) {

                    case 1202: // ERROR_ARANGO_DOCUMENT_NOT_FOUND
                        error = new NotFoundError();
                        break;

                    case 1203: // ERROR_ARANGO_COLLECTION_NOT_FOUND
                        const collectionName = error.message.split(': ')[1];
                        error = new AdapterError('Database `' + this.client['name'] + '` has no collection `'
                            + collectionName + '`');
                        break;

                    case 1210: // ERROR_ARANGO_UNIQUE_CONSTRAINT_VIOLATED
                        error = new AlreadyExistsError();
                        break;

                }

                break;
        }

        throw error;
    }
}

export default ArangoDBAdapter;