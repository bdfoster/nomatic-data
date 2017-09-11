import DataError from './DataError';

export default class AlreadyExistsError extends DataError {
    constructor() {
        super(409, 'Already exists');
    }
}
