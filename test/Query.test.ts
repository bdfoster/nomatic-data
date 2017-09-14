import 'mocha';
import {expect} from 'chai';
import Query, {WhereQuery} from '../src/Query';

describe('Query', () => {
    let instance;
    before(() => {
        instance = new Query();
    });

    describe('#where()', () => {
        it('should return a WhereQuery instance when only `key` is specified', () => {
            expect(instance.where('test0')).to.be.an.instanceOf(WhereQuery);
        });

        it('should use $and modifier by default', () => {
            instance.where('test1', '$eq', true);

            expect(instance.data.$query.$and).to.exist;
            expect(instance.data.$query.$and.length).to.equal(1);
            expect(instance.data.$query.$and[0]).to.deep.equal({
                test1: {
                    $eq: true
                }
            });
        });

        it('should throw when an invalid modifier is specified', () => {
            try {
                instance.where('test1', '$gte', 1, '$invalid');
            } catch (error) {
                if (error.message = 'Invalid modifier: $invalid') {
                    return;
                }

                throw error;
            }
        });
    });

    describe('#or()', () => {
        it('should add last data added to $or operator and return WhereQuery instance', () => {
            const where = instance.or('test1');
            expect(where).to.be.instanceOf(WhereQuery);
            const inst = where.eq(true);
            expect(instance).to.equal(inst);
        });
    });
});