import 'mocha';
import {expect} from 'chai';
import Query from '../src/Query';
import WhereQuery from '../src/WhereQuery';
import queries from './fixtures/queries';
import {inspect} from 'util';
describe('Query', () => {
    let instance;
    before(() => {
        instance = new Query((query) => {
            return Promise.resolve([]);
        });
    });

    describe('#$limit()', () => {
        it('should set `data.$limit` and return the instance', () => {
            expect(instance.limit(10)).to.equal(instance);
            expect(instance.data.$limit).to.equal(10);
        });
    });

    describe('#$skip()', () => {
        it('should set `data.$skip` and return the instance', () => {
            expect(instance.skip(1)).to.equal(instance);
            expect(instance.data.$skip).to.equal(1);
        });
    });

    describe('#sort()', () => {
        it('should specify ascending direction by default', () => {
            instance.sort('test1');
            expect(instance.data.$sort.length).to.equal(1);
            expect(instance.data.$sort[0][0]).to.equal('test1');
            expect(instance.data.$sort[0][1]).to.equal(1);
        });

        it('should specifying desending order by setting `direction` to a negative number', () => {
            instance.sort('test1', -234092);
            expect(instance.data.$sort.length).to.equal(2);
            expect(instance.data.$sort[1][0]).to.equal('test1');
            expect(instance.data.$sort[1][1]).to.equal(-1);
        });

        it('should throw if `order` is 0', () => {
            try {
                instance.sort('test1', 0);
            } catch(error) {
                if (error.message === 'Invalid sorting order: 0') {
                    return;
                }

                throw error;
            }

            throw new Error('Did not throw!');
        });
    });

    describe('#or()', () => {
        it('should throw if #where() was never called', () => {
            try {
                instance.or('hello');
            } catch (error) {
                if (error.message === 'Cannot use `or()` without using `where()` first') {
                    return;
                }

                throw error;
            }

            throw new Error('Did not throw!');
        });

        it('should add last data added to $or operator and return WhereQuery instance', () => {
            instance.where('test1', '$eq', true);
            const where = instance.or('test1');
            expect(where).to.be.instanceOf(WhereQuery);
            const inst = where.eq(true);
            expect(instance).to.equal(inst);
        });
    });

    describe('#where()', () => {
        it('should return a WhereQuery instance when only `key` is specified', () => {
            expect(instance.where('test0')).to.be.an.instanceOf(WhereQuery);
        });

        it('should use $and modifier by default', () => {
            instance.where('test1', '$eq', true);

            expect(instance.data.$where.$and).to.exist;
            expect(instance.data.$where.$and.length).to.equal(1);
            expect(instance.data.$where.$and[0]).to.deep.equal({
                test1: {
                    $eq: true
                }
            });
        });

        it('should throw when an invalid logical operator is specified', () => {
            try {
                instance.where('test1', '$gte', 1, '$invalid');
            } catch (error) {
                if (error.message === 'Invalid logical operator: $invalid') {
                    return;
                }

                throw error;
            }

            throw new Error('Did not throw!');
        });

        it('should throw when an invalid operator is specified', () => {
            try {
                instance.where('test1', '$invalid', 1);
            } catch (error) {
                if (error.message === 'Invalid operator: $invalid') {
                    return;
                }

                throw error;
            }

            throw new Error('Did not throw!');
        });
    });

    describe('#run()', () => {
        it('should run the specified function', (done) => {
            instance.run().then((results) => {
                expect(results.length).to.equal(0);
            }).then(done, done);
        });
    });

    describe('#parse()', () => {
        for (const i in queries) {
            it('should parse query ' + queries[i].desc, () => {
                for (const j in queries[i].data) {
                    const q = new Query(null, queries[i].data[j]);
                    expect(q.data).to.deep.equal(queries[i].data[0]);
                }
            });
        }
    });
});