import DataError from './DataError';

export default class AssertionError extends DataError {
    constructor(path: string, expected: any, actual: any) {
        super(412, 'Assertion Error: expected `' + path + '` to equal `' + expected + '` but got `' + actual + '`');
        this['path'] = path;
        this['expected'] = expected;
        this['actual'] = actual;
    }
}