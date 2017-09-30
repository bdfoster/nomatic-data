import * as get from 'lodash.get';
import * as pick from 'lodash.pick';
import * as set from 'lodash.set';
import * as unset from 'lodash.unset';
import {EventEmitter} from 'nomatic-events';
import {isNullOrUndefined} from 'util';

export type RecordOperation = 'add' | 'replace' | 'remove';
export type RecordSaveFunction = (record: Record) => Promise<boolean | RecordData | Record>;
export type RecordValidateFunction = (data: RecordData) => Promise<void | RecordData>;
export type RecordVirtualPropertyFunction = () => any;

export interface RecordChange {
    operation?: RecordOperation;
    key: string;
    old: any;
    new: any;
}

export interface RecordData {
    id?: string;
    rev?: string;
    [key: string]: any;
}

export interface RecordOptions {
    maxListeners?: number;

    /**
     * Function to handle syncing changes of the Record instance to the storage device.
     */
    save?: RecordSaveFunction;

    /**
     * Function to handle validation of the Record instance and its properties. Called on `Record.validate()`.
     */
    validate?: RecordValidateFunction;

    /**
     * Object to describe virtual properties.
     */
    virtuals?: RecordVirtualProperties;
}

export interface RecordVirtualProperties {
    [key: string]: RecordVirtualPropertyOptions | RecordVirtualPropertyFunction;
}

export interface RecordVirtualPropertyOptions {
    /**
     * Function which returns the value of the virtual property.
     * @returns {any}
     */
    get?: RecordVirtualPropertyFunction;

    /**
     * Function which sets the value of the virtual property. Can be used to set
     * other properties within the Record instance.
     * @param value
     */
    set?: (value: any) => void;

    /**
     * Should the output of `get` handler be saved to the storage device?
     */
    save?: boolean;

    /**
     * Should the output of `get` handler be included in the serialized Record?
     */
    serialize?: boolean;
}


/**
 * A trackable object with configurable `save` handler. Changes to the object can be reverted incrementally
 * in the reverse order the changes were made.
 * @class Record
 * @extends EventEmitter
 */
export class Record extends EventEmitter {
    [key: string]: any;

    private _changes: RecordChange[];
    private _data: RecordData;
    private _save: RecordSaveFunction;
    private _validate: RecordValidateFunction;
    private _virtuals: Map<string, RecordVirtualPropertyOptions>;

    constructor(options: RecordOptions | Record = {}, data?: RecordData) {
        super(options.maxListeners || 0);
        this._changes = [];
        this._data = {};

        if (options instanceof Record) {
            this.init(options);
        } else {
            this._save = options.save || null;
            this._validate = options.validate || null;
            this.init(data, options.virtuals);
        }

        return this.proxy();
    }

    /**
     * Return the changes since last `save()` or `init()`. By default, it returns all changes.
     * @param {number} count Number of changes to return (in reverse chronological order).
     * @returns {RecordChange[]}
     */
    public changes(count: number = null) {
        if (count === null) count = this._changes.length;
        const start = (this._changes.length) - count;
        const end = start + count;
        return this._changes.slice(start, end);
    }

    /**
     * Set virtual property definitions.
     * @param {RecordVirtualProperties} value
     */
    public set virtuals(value: RecordVirtualProperties) {
        const ignoredKeys = ['set', 'get', 'save', 'serialize'];
        this._virtuals = new Map();

        function recurse(path) {
            let target = get(value, path);
            if (target instanceof Function) {
                target = {
                    get: target
                };
            }

            if (!target.hasOwnProperty('save')) target.save = false;
            if (!target.hasOwnProperty('serialize')) target.serialize = true;

            this._virtuals.set(path, pick(target, ignoredKeys));

            for (const key in target) {
                if (target.hasOwnProperty(key)) {
                    if (ignoredKeys.indexOf(key) === -1) {
                        recurse.apply(this, [path + '.' + key]);
                    }
                }
            }
        }

        for (const key in value) {
            recurse.apply(this, [key]);
        }
    }

    /**
     * Recursive/nested proxy. This is normally returned from `constructor()` method.
     *
     * @param {any} path
     * @returns {any}
     */
    private proxy(path = null) {
        const self = this;

        const traps = {
            get(target, key) {
                if (path) key = path + '[' + key.toString() + ']';
                if (get(self, key)) {
                    return get(self, key);
                } else if (typeof self.get(key) === 'object' && self.get(key) !== null) {
                    return self.proxy(key);
                }
                return self.get(key);
            },
            set(target, key, value) {
                if (path) {
                    if (!isNaN(key) ) {
                        key = path + '[' + key.toString() + ']';
                    } else {
                        key = path + '.' + key;
                    }
                }
                if (get(self, key)) {
                    if (value === null) {
                        self.unset(key);
                    } else {
                        set(self, key, value);
                    }
                } else {
                    self.set(key, value);
                }
                return true;
            },
            deleteProperty(target, key) {
                if (path) key = path + '[' + key + ']';

                if (get(self, key)) {
                    return false;
                }
                return self.unset(key);
            }
        };

        if (path === null) {
            return new Proxy(this, traps);
        }

        return new Proxy(get(this._data, path), traps);
    }

    /**
     * Initialize the instance. Data passed here is assumed to be the ground truth with respect to changes. All previous
     * changes are cleared on each call.
     *
     * @param {RecordData} data
     * @param {RecordVirtualProperties} virtuals
     */

    public init(data: Record | RecordData, virtuals: RecordVirtualProperties = null) {
        if (data instanceof Record) {
            // Essentially clone the old Record instance
            this._changes = data._changes.slice();
            this._data = Object.assign({}, data._data);
            this._validate = data._validate;
            this._virtuals = new Map(data._virtuals);
            this._save = data._save;
            return;
        }

        return this.commit(data, virtuals);
    }

    public commit(data: string | number | boolean | RecordData | Record, virtuals: RecordVirtualProperties = null) {
        if (virtuals) {
            this.virtuals = virtuals;
        } else if (!this._virtuals) {
            this._virtuals = new Map();
        }

        if (typeof data === 'object') {
            if (data instanceof Record) {
                this._data = data._data;
            } else {
                this._data = data;
            }


        } else {
            if (data !== true) {
                this.rev = data;
            }
        }

        for (const entry of this._virtuals.entries()) {
            if (entry[1].save) {
                const value = get(this._data, entry[0]);
                if (entry[1].set && !isNullOrUndefined(value)) {
                    entry[1].set(value);
                } else {
                    set(this._data, entry[0], entry[1].get());
                }
            }
        }

        this._changes = [];
    }

    /**
     * Convenience method for returning value at `key` in `_data`. `key` can be a string or Array describing the path
     * under `_data`.
     *
     * @param key The path under `_data`.
     * @returns The value at `key` under `_data`.
     */
    public get(key: (string | number)[] | string): any {
        if (typeof key !== 'string') key = key.toString();
        if (this._virtuals.has(key)) return this._virtuals.get(key).get.apply(this.proxy());

        return get(this._data, key);
    }

    /**
     * Set a value at `key` in `_data`. Anything set using this method will have a corresponding entry in `_changes`.
     *
     * @param key
     * @param value
     */
    public set(key, value) {
        if (typeof key !== 'string') key = key.toString();
        let isVirtual = false;

        if (this._virtuals.has(key)) {
            const definition = this._virtuals.get(key);
            if (definition.hasOwnProperty('set')) {
                if (!definition.save) {
                    definition.set.apply(this.proxy(), [value]);
                    return true;
                }
                isVirtual = true;
            } else {
                return false;
            }
        }

        const parentKey = key.split('.');
        parentKey.pop();
        const parent = this.get(parentKey);

        if (parent instanceof Array && key.endsWith('length')) return;

        const operation: RecordOperation = !!this.get(key) ? 'replace' : 'add';

        let old = this.get(key);

        if (isVirtual) {
            this._virtuals.get(key).set(value);
            value = this._virtuals.get(key).get.apply(this);
        }

        let newVal = value;

        if (value instanceof Object) {
            if (value instanceof Array) {
                newVal = value.slice();
            } else {
                newVal = Object.assign({}, value);
            }
        }

        if (operation === 'replace' && old instanceof Object) {
            if (old instanceof Array) {
                old = old.slice();
            } else {
                old = Object.assign({}, old);
            }
        }

        const change = {
            operation: operation,
            key: key,
            old: old,
            new: newVal
        };

        set(this._data, key, value);

        this._changes.push(change);
    }

    /**
     * Essentially deletes a property at `key` under `_data`. Uses of this method will have a corresponding entry in
     * `_changes` so long as a value exists. Virtual properties cannot be unset.
     *
     * @param key
     * @returns {boolean} If true, unset was successful. If false, there's nothing set at `key` under `_data` or it is
     * a virtual property.
     */
    public unset(key) {
        if (!isNullOrUndefined(get(this._virtuals, key))) return false;
        const operation: RecordOperation = 'remove';
        let old = this.get(key);

        if (old === undefined) return false;

        if (old instanceof Object) {
            old = Object.assign({}, old);
        }

        const change = {
            operation: operation,
            key: key,
            old: old,
            new: undefined
        };

        if (unset(this._data, key)) {
            this._changes.push(change);
            return true;
        }

        return false;
    }

    /**
     * Calls `_save()` (if it exists). All changes are considered committed if `_save` exists
     * and returns successfully.
     *
     * @returns {Promise<void>}
     */
    public async save() {
        if (this._save) {
            try {
                const result = await this._save(this);
                this.commit(result);
            } catch (e) {
                throw e;
            }
        }
    }

    public async validate() {
        if (this._validate) {
            try {
                await this._validate(this);
            } catch(e) {
                throw e;
            }
        }
    }

    /**
     * Reverts changes to `_data` made by `set()` and `unset()` methods.
     *
     * @param {number} count The number of changes to revert (in reverse chronological order). By default, all changes
     * are reverted.
     */
    public revert(count: number = this._changes.length) {
        for (let i = 0; i < count; i++) {
            const change = this._changes.pop();

            switch(change.operation) {
                case 'remove':
                case 'replace':
                    set(this._data, change.key, change.old);
                    break;
                case 'add':
                    unset(this._data, change.key);
                    break;
            }
        }
    }

    /**
     * Serialize the Record instance as an object. Called by `#toJSON()`.
     * @returns {RecordData}
     */
    public serialize(condition: 'save' | 'serialize' = 'serialize'): RecordData {
        const result = Object.assign({}, this._data);

        for (const entry of this._virtuals.entries()) {
            const value = entry[1].get.apply(this.proxy());

            if (entry[1][condition] === false || isNullOrUndefined(value)) {
                unset(result, entry[0]);
            } else {
                set(result, entry[0], value);
            }
        }

        return result;
    }

    public toJSON(): RecordData {
        return this.serialize();
    }
}

export default Record;
