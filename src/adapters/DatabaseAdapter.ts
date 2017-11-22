import Adapter from './Adapter';

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

export default DatabaseAdapter;
