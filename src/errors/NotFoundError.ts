import DataError from './DataError';

export default class NotFoundError extends DataError {
    constructor(message: string = 'Not Found') {
        super(404, message);
    }
}