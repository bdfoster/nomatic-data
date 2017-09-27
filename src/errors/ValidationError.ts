import DataError from './DataError';

export interface ValidationErrorOptions {
    path: string;
    keyword: string;
    message: string;
}

export default class ValidationError extends DataError {
    constructor(data: ValidationErrorOptions) {
        super(422, `${data.path} ${data.message}`);
        this['path'] = data.path;
        this['message'] = data.message;
        this['keyword'] = data.keyword;
    }
}
