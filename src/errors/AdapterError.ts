import DataError from './DataError';

export default class AdapterError extends DataError {
    constructor(message) {
        super(500, message);
    }
}
