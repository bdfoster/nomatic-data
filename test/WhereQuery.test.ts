import 'mocha';
import {expect} from 'chai';
import Query from '../src/Query';
import WhereQuery from '../src/WhereQuery';

describe('WhereQuery', () => {
    let instance;

    before(() => {
       const query = new Query();
       instance = new WhereQuery(query, 'test1');
    });

    for (const operator of Query.COMPARISON_OPERATORS) {
       const functionName = operator.substr(1);
       describe('#' + functionName + '()', () => {
           it('should add result and return parent', () => {
               let value;
               if (operator === '$in') {
                   value = [1, 'hello', true];
               } else {
                   value = 1;
               }

               const parent = instance[functionName](value);
               expect(parent).to.be.instanceOf(Query);
           });
       });
    }

    describe('#exists()', () => {
        it('should add result and return parent', () => {
            const parent = instance.exists();
            expect(parent).to.be.instanceOf(Query);
        });
    });

    describe('#is', () => {
        it('should return an instance of itself (for chaining)', () => {
            expect(instance.is).to.equal(instance);
        });
    });
});
